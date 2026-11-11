"""
Looks at the app with a headless Chrome of this Mac, on a throwaway profile:
no account is signed in, nothing is kept. For screenshots and measurements
without the Chrome extension (which works in the user's own browsers).

    python3 scripts/headless.py steps.json [--url http://localhost:5186/] [--size 1440x823] [--scale 1]

steps.json is a list of steps, run in order on one page:
    {"eval": "js expression"}            run it in the page (top-level await works); its value is printed
    {"wait": 2.5}                        seconds
    {"shot": "out.png"}                  screenshot of the page; with "clip": [x, y, w, h] (css pixels) only that
    {"click": "text or css"}             click the first button/link whose text is exactly that, or the css selector
    {"goto": "http://localhost:5186/"}   navigate

Example: open the Lab's 3D tract, turn the head to the front, screenshot it:
    [{"wait": 3}, {"click": "Lab"}, {"wait": 2}, {"eval": "window.tutorLayers && 1"}, {"shot": "/tmp/lab.png"}]

The page's console errors are printed at the end. Chrome is closed when the
script ends (also when it fails).
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


async def main():
    steps = json.load(open(sys.argv[1]))
    url = arg('--url', 'http://localhost:5186/')
    w, h = (int(v) for v in arg('--size', '1440x823').split('x'))
    scale = float(arg('--scale', '1'))
    port = 9400 + os.getpid() % 500
    profile = tempfile.mkdtemp(prefix='vw-headless-')
    chrome = subprocess.Popen([
        CHROME, '--headless=new', f'--remote-debugging-port={port}', f'--user-data-dir={profile}',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--hide-scrollbars',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--enable-gpu-rasterization', *(['--use-angle=metal'] if '--metal' in sys.argv else []), f'--window-size={w},{h}', 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        ws_url = None
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=1))
                pages = [t for t in tabs if t.get('type') == 'page']
                if pages:
                    ws_url = pages[0]['webSocketDebuggerUrl']
                    break
            except Exception:
                pass
            time.sleep(0.2)
        if not ws_url:
            raise SystemExit('Chrome did not start')
        async with websockets.connect(ws_url, max_size=64 << 20) as ws:
            n = 0
            pending = {}
            loaded = asyncio.Event()

            async def reader():
                async for raw in ws:
                    m = json.loads(raw)
                    if 'id' in m and m['id'] in pending:
                        pending[m['id']].set_result(m)
                    elif m.get('method') == 'Page.loadEventFired':
                        loaded.set()
                    elif m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']
                        errors.append('exception: ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:300])
                    elif m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] == 'error':
                        errors.append('console.error: ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in m['params']['args'])[:300])

            task = asyncio.create_task(reader())

            async def send(method, **params):
                nonlocal n
                n += 1
                fut = asyncio.get_event_loop().create_future()
                pending[n] = fut
                await ws.send(json.dumps({'id': n, 'method': method, 'params': params}))
                r = await fut
                if 'error' in r:
                    raise RuntimeError(f'{method}: {r["error"]}')
                return r.get('result', {})

            async def run(expr):
                r = await send('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True, replMode=True, timeout=120000)
                if 'exceptionDetails' in r:
                    d = r['exceptionDetails']
                    return 'ERROR ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:400]
                return r['result'].get('value')

            await send('Page.enable')
            await send('Runtime.enable')
            await send('Emulation.setDeviceMetricsOverride', width=w, height=h, deviceScaleFactor=scale, mobile=False)
            await send('Page.navigate', url=url)
            await asyncio.wait_for(loaded.wait(), 60)
            for i, st in enumerate(steps):
                if 'goto' in st:
                    loaded.clear()
                    await send('Page.navigate', url=st['goto'])
                    await asyncio.wait_for(loaded.wait(), 60)
                elif 'wait' in st:
                    await asyncio.sleep(st['wait'])
                elif 'eval' in st:
                    v = await run(st['eval'])
                    print(f'[{i}] {json.dumps(v, ensure_ascii=False)[:2000]}')
                elif 'click' in st:
                    sel = json.dumps(st['click'])
                    v = await run(f"""(() => {{ const t = {sel}; let el = null;
                      try {{ el = document.querySelector(t); }} catch (e) {{}}
                      if (!el) el = [...document.querySelectorAll('button, a, [role=button], [role=tab], option, label')].find(b => b.textContent.trim() === t || b.getAttribute('aria-label') === t || b.title === t);
                      if (!el) return 'not found'; el.click(); return 'clicked'; }})()""")
                    print(f'[{i}] click {st["click"]}: {v}')
                elif 'shot' in st:
                    p = {'format': 'png'}
                    if 'clip' in st:
                        x, y, cw, ch = st['clip']
                        p['clip'] = {'x': x, 'y': y, 'width': cw, 'height': ch, 'scale': 1}
                    r = await send('Page.captureScreenshot', **p)
                    os.makedirs(os.path.dirname(os.path.abspath(st['shot'])), exist_ok=True)
                    open(st['shot'], 'wb').write(base64.b64decode(r['data']))
                    print(f'[{i}] saved {st["shot"]}')
            task.cancel()
    finally:
        chrome.terminate()
        try:
            chrome.wait(5)
        except Exception:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)
    if errors:
        print('--- the page reported:')
        for e in dict.fromkeys(errors):
            print(' ', e)


asyncio.run(main())

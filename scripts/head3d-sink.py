"""
A tiny local server that keeps what the browser sends it: used to take the bent head of the 3D view
(window.tract3d in dev) out of the page for the skin bake (scripts/head3d-bake.py).

    python3 scripts/head3d-sink.py <out-dir> [port=5199]

POST /<name> writes the request body to <out-dir>/<name> (names: letters, digits, '-', '_', '.').
Only listens on 127.0.0.1.
"""
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5199
os.makedirs(OUT, exist_ok=True)


class Sink(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = self.path.strip('/')
        if not re.fullmatch(r'[\w.-]+', name):
            self.send_response(400); self._cors(); self.end_headers(); return
        n = int(self.headers.get('Content-Length', '0'))
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(f'{len(data)}'.encode())

    def log_message(self, *a):
        pass


HTTPServer(('127.0.0.1', PORT), Sink).serve_forever()

import { useEffect } from 'react';
import { store, useUi, Mode } from './store';
import { useT, useL } from './i18n';
import { DriverBar } from './components/DriverBar';
import { Learn } from './modes/Learn';
import { Play } from './modes/Play';
import { Lab } from './modes/Lab';
import { Tutor } from './modes/Tutor';
import { voice } from './voice/voice';
import { useManual, useSoundOn, useVoice } from './voice/hooks';

const MODES: [Mode, 'mLearn' | 'mPlay' | 'mLab' | 'mTutor', 'mLearnHint' | 'mPlayHint' | 'mLabHint' | 'mTutorHint'][] = [
  ['learn', 'mLearn', 'mLearnHint'], ['play', 'mPlay', 'mPlayHint'], ['lab', 'mLab', 'mLabHint'], ['tutor', 'mTutor', 'mTutorHint'],
];

/** The bar every mode shares: the name, the three modes, one Sound button, the volume, the language; then who drives the voice. */
function Header() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const p = useManual();
  const sound = useSoundOn();
  const sustain = useVoice((v) => v.sustain);
  return (
    <header className="app-header">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
          <path d="M3 16 Q8 4 13 16 T23 16" fill="none" stroke="#f6a823" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M14 22 Q19 12 24 22 T31 20" fill="none" stroke="#2ad4bd" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
          <circle cx="8" cy="25" r="1.6" fill="#a98bfa" /><circle cx="12" cy="27.5" r="1.1" fill="#a98bfa" />
        </svg>
        <div>
          <h1>{t('appTitle')}</h1>
          <p>{t('appSub')}</p>
        </div>
      </div>
      <nav className="modes" aria-label={L({ it: 'Modo', en: 'Mode' })}>
        {MODES.map(([id, name, hint]) => (
          <button key={id} className={ui.mode === id ? 'on' : ''} title={t(hint)} aria-current={ui.mode === id ? 'page' : undefined} onClick={() => store.setUi({ mode: id })}>{t(name)}</button>
        ))}
      </nav>
      <div className="header-actions">
        <button className={sound ? 'btn sound on' : 'btn primary pulse sound'} title={t(sound ? 'soundOffHint' : 'soundHint')} onClick={() => void voice.setSound(!sound)}>
          {sound ? '■ ' + t('soundOn') : '▶ ' + t('sound')}
        </button>
        {ui.mode === 'lab' && (
          <button className={sustain ? 'chip on' : 'chip'} title={t('holdHint')} aria-pressed={sustain} onClick={() => voice.setSustain(!sustain)}>∞ {t('hold')}</button>
        )}
        <label className="mini vol" title={t('volume')}>
          <span aria-hidden>🔈</span>
          <input type="range" min={-30} max={12} step={0.5} value={p.volume} aria-label={t('volume')} onChange={(e) => voice.edit((q) => { q.volume = Number(e.target.value); })} />
        </label>
        <div className="seg lang">
          <button className={ui.lang === 'en' ? 'on' : ''} onClick={() => store.setUi({ lang: 'en' })}>EN</button>
          <button className={ui.lang === 'it' ? 'on' : ''} onClick={() => store.setUi({ lang: 'it' })}>IT</button>
        </div>
      </div>
      <DriverBar />
      {ui.info && <div className="toast" onClick={() => store.setUi({ info: null })}>{ui.info} — {L({ it: 'clic per chiudere', en: 'click to close' })}</div>}
    </header>
  );
}

export function App() {
  const t = useT();
  const L = useL();
  const ui = useUi();
  useEffect(() => { document.documentElement.lang = ui.lang; document.title = t('appTitle'); }, [ui.lang]);
  return (
    <div className={`app mode-${ui.mode}`}>
      <Header />
      {ui.mode === 'learn' && <Learn />}
      {ui.mode === 'play' && <Play />}
      {ui.mode === 'lab' && <Lab />}
      {ui.mode === 'tutor' && <Tutor />}
      <footer className="app-footer">
        <span>{L({ it: 'Modello fisico: sorgente LF o a due masse, tratto vocale a guida d’onda (Kelly-Lochbaum) con naso e seni, turbolenza da numero di Reynolds, ostacolo dei denti. Dettagli e riferimenti nel README.', en: 'Physical model: LF or two-mass source, waveguide vocal tract (Kelly-Lochbaum) with nose and sinuses, Reynolds-number turbulence, teeth obstacle. Details and references in the README.' })}</span>
      </footer>
    </div>
  );
}

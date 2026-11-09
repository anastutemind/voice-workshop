# Voice Workshop (Officina della voce)

An interactive, physically based simulator of human voice production: a buzz
(the vocal folds), a hiss (turbulent air) and a filter (the vocal tract). It
follows the concepts of the video "The Buzz and the Filter" and lets you hear
and see each of them, from the single glottal pulse to sequenced speech.

**Try it in the browser: https://mithrilman.github.io/voice-workshop/**

[![The Buzz and the Filter: how a voice is made (video, 7 min)](public/video/the-buzz-and-the-filter.jpg)](public/video/the-buzz-and-the-filter.mp4)

**The Buzz and the Filter: how a voice is made** (7 minutes, English with
captions) takes a voice apart: the vocal folds, the throat and the mouth,
formants, noise, and the spectrogram. It is narrated by the small speech model
of the paper [Teacher in the Loop](https://github.com/MithrilMan/teacher-in-the-loop)
(doi:[10.5281/zenodo.23400040](https://doi.org/10.5281/zenodo.23400040)). In
the app it opens from the first step of Learn.

Everything is computed live in the browser: a mid-sagittal articulatory model
of the head gives an area function, a lossy Kelly-Lochbaum waveguide with
nasal cavity, sinuses, yielding walls and lip radiation filters a glottal
source (Liljencrants-Fant or a self-oscillating two-mass model), and
turbulence noise appears wherever the Reynolds number of the airflow says it
should, with a separate obstacle source where the jet hits the incisors.

The interface is in English by default, with an Italian toggle (EN / IT). The
last choice is remembered in the browser, and `?lang=it` or `?lang=en` in the
address opens the page in that language. The Letters mode teaches the
alphabets of Urdu, Arabic and Hindi (`?mode=tutor&tutor=ur`, `ar` or `hi`),
and the Speak panel reads text in those three languages too.

## Run

Requirements: Node.js 20.19+ or 22.12+ (Vite 8), a recent Chrome, Edge,
Firefox or Safari (AudioWorklet).

```bash
npm install
npm run dev        # http://localhost:5186
npm test           # 128 automated tests (physics, speech, analysis, the voice controller, interface text)
npm run validate   # runs the tests and prints every validation number as a table
npm run build      # type check + production build in dist/ (static files, relative paths)
npm run preview    # serves dist/
```

Or, without Node on the machine, in a container (Docker Compose):

```bash
docker compose up                      # http://localhost:5186
docker compose run --rm dev npm test
```

Every push to `main` runs the tests, builds the site and publishes it on
GitHub Pages (`.github/workflows/pages.yml`).

Press **▶ Sound / Suono** in the header (browsers only allow audio after a user
gesture): it gives the head a breath of voice, and you hear its shape. Press
it again to stop everything. Any phoneme, voice, sentence or experiment also
starts the audio by itself. The voice of your hands lasts a breath: it rests
2.5 s after the last change (a phoneme picked, a handle or a slider moved),
and keeps sounding while you drag the head, so nothing drones on; the Lab's
**∞ Hold** keeps it sounding. The volume starts at -8 dB (a held vowel near
-30 dBFS), and a limiter on the output catches the bursts of a sentence or a
volume pushed up.

## What you can do

Four modes, switchable in the header and remembered in the browser:

- **Learn**, for someone who starts from nothing (a welcome and 11 chapters,
  the first ones following the video), one step at a time. The head and the
  one view the step needs fill the screen; under them sits the step: one
  idea in a sentence or two, the sounds to try (one to three buttons, the
  next one lit), what to look and listen for, and on demand the explanation
  ("Why?") and the live numbers behind it. Opening a step is silent: the
  head takes the step's starting shape and nothing sounds until you ask.
  Back and Next (or the arrow keys) turn the steps, the dots jump to one,
  and the chapter's name opens the list of chapters. The chapters: a buzz and a filter; waves, harmonics and spectrum; the source
  (pulses, pitch, melody with the buzz alone); the filter (formants, vowels,
  the F1-F2 map, what belongs to the person); two independent knobs (source
  and filter); the hiss (s, f, breathy voice, pulsed aspiration); consonants
  (closures, the pressure behind them, voice onset time); the nose (velum,
  antiresonances, the two passages); vocal tracts measured by MRI and the
  tract in 3D (the side channels of an "l", the piriform fossae); the
  spectrogram (slices, window trade-off, log-mel); from sounds to sentences
  (coarticulation, timing, melody, each one switched off); a machine voice.
  Steps that need a tool (A/B, melody, machine voice) open it on the
  stage, beside the view. Where a step is about a hand, a hint on the head
  points at the handle to drag (the tongue, the jaw, the lips, the velum)
  until you drag it. A test keeps the steps short (at most 220 characters of
  text, three sounds, seven steps a chapter) and checks that every step
  opens in silence, that every sound of it is heard as it is shown, and that
  it rests a breath later.
- **Play**, for someone who wants to try things without the theory, one
  activity at a time. Four big tabs (Speak, Sounds, Voices, Vowels) each
  show the head with its handles beside the one view that suits them (the
  spectrogram for a sentence, the spectrum for a sound or a voice, the
  vowel map for the vowels) and, under them, only that activity's controls:
  a text to say, the phoneme buttons, the four speakers, the vowels. On a
  phone the controls sit right under the head.
- **Lab**, for someone who knows the subject, one bench at a time. A block of
  the signal chain, Source → Tract → Noise → Output, chooses the bench: the
  views that part of the chain is seen in (the vocal folds and the spectrum
  for the source, the tube and the vowel map for the tract, the spectrum
  and the spectrogram for the noise, the scope and the spectrogram for the
  output) and its controls in the inspector, where one section is open at
  a time. The experiments (Speak, Melody, A/B, Machine voice) open from a
  menu at the end of the chain, in place of the inspector, with a button
  back to the block you came from. One or two views; each has its own view
  picker and an enlarge button (Esc closes it), and a view changed is
  remembered for that bench in the browser.
- **Letters**, a pronunciation tutor for a child learning to read Urdu,
  Arabic or Hindi, one letter at a time. Three big tabs choose the language;
  the letters sit in a grid in their traditional order, coloured by where
  in the mouth they are made (lips, tongue at the teeth, tongue tip, tip
  curled back, middle and back of the tongue, throat, nose). Picking a
  letter shapes the head as its sound, in silence, with a hint on the handle
  that matters ("Curl the tip back"); beside the head a second view shows the
  mouth from the front, as in a mirror: the lips opening, rounding and
  pushing forward, the teeth, the tongue where it shows, the air that comes
  out of the mouth or the nose, and the buzz of the voice in the throat.
  The card under them says, in words a five-year-old can follow, what the
  lips, the tongue, the air and the voice do, a trick to feel it, an English
  sound it is like, and a word that starts with the letter, in the script,
  in Latin letters and in English; buttons hold the sound (or say a stop
  with its vowel), say it with a vowel, and say the word. A speed switch
  plays everything at normal speed, at half or at a quarter: in slow motion
  the gestures themselves slow down (the plan is stretched and the
  articulators move as many times slower), so the tongue can be watched
  getting into place; "Step by step" poses the head at any instant of the
  letter or the word with a slider, in silence. The arrow keys turn the
  letters. The alphabets: Urdu (the 39 letters, the 11 aspirated letters
  written with do-chashmī he, and the three vowel marks), Arabic (the 28
  letters, hamza, the three short vowels and shadda) and Hindi (13 vowels,
  33 consonants and the 7 letters with a nukta). The instructions are in
  English; the letters, their names and the words are in their language.

Who drives the voice is always shown under the header. Your hands (the
handles, the sliders, the phoneme buttons) drive it unless something else
does: a sentence moves the tongue, lips, jaw, velum, pitch, lungs and glottis;
a melody the pitch, lungs and glottis (the head stays yours, so you can change
the vowel while it sings); a clip everything but the volume. The filter can
also leave the head: a measured or drawn tube replaces the tongue, jaw, lips,
teeth and body, and "no filter" lets you hear the raw source. Whatever is
driven is locked where you see it: sliders are greyed with a padlock, the
live value and the reason; the head's handles turn hollow and say who moves
them. **Stop** gives the voice back to your hands, **Take over** keeps the
posture and pitch sounding at that instant, **Back to the head** leaves the
tube. When a sentence, melody or clip ends, the head glides back to the
posture you had and the lungs stop, so nothing starts again by itself.

Views:

| View | What it shows |
|---|---|
| Head | Mid-sagittal head, drawn as an anatomical illustration, with draggable handles for tongue body, tongue tip, jaw, lips, velum, larynx and incisors. Everything that bounds the air is drawn from the acoustic geometry of the moment, so what you see is what sounds. The airway is coloured by the live acoustic field (pressure, particle velocity or airflow), with glottal pulses, nasal airflow, turbulence particles at the jet and the teeth, and sparks on releases. |
| Vowel map | F1-F2 chart (log axes) with Peterson & Barney (men, women, children), Hillenbrand et al. and the narrator's vowels of the video; the model's vowels are clickable, dragging blends articulations; the live trail and the microphone's formants are drawn on it. |
| Spectrum | Measured output spectrum, predicted harmonics (source harmonics x filter), filter envelope, formant labels, optional microphone overlay. |
| Waveform | Output pressure, glottal flow and noise. |
| Vocal folds | Top view of the glottis in slow motion, the LF cycle with tp / te / ta, the two-mass schematic. |
| Tube | The tract as a tube of sections with the field and the standing waves of F1-F3; in tube mode you draw the area function directly (16 points) and set its length, or listen to one of the 11 vowel shapes measured by MRI (Tract & person tab). |
| 3D tract | The airway in three dimensions, built from the same cross-sections the sound is computed with and coloured by the live field, inside the tongue, palate, teeth, velum, pharynx and lips; the lateral channels and the supralingual cavity of an /l/, the piriform fossae with their water. Drag to turn, scroll to zoom; side, front, top and ¾ views, a mid-sagittal cutaway, tissues and labels on or off; Numbers gives the narrowest passage, the channels and the cavity. Loaded on demand (three.js, WebGL). |
| Spectrogram | Scrolling, 0-8 kHz linear or 80-band log-mel; analysis window from 3 to 80 ms with a plain explanation of the time-frequency trade-off. |

Inspector (Lab) and tools (Learn):

| Block | Controls |
|---|---|
| Source | Lungs, voicing, F0, lung pressure, glottal opening, vibrato; voice presets (man, woman, child, deep, whisper, vocal fry, breathy, pressed, raspy); LF (Rd or Oq / alpha_m / Ra) or two-mass (tension, asymmetry, rest area); peak area, source-tract interaction, posterior chink; jitter, shimmer, diplophonia. |
| Tract: tract & person | Filter (head, tube or none), articulators as sliders, phoneme buttons (IPA), the vowels measured by MRI (Story 2008) loaded as the tube, anatomy (size, pharynx length and width, nasal leak, nasal cycle, each nostril, pinch the nose, air in the piriform fossae), timbre presets, losses. |
| Tract: teeth & slit | Front view and side view of the incisors with the jet; slit width, extra opening, diastema, overjet, advance, upper / lower incisor length, tongue groove; presets (open bite, gap teeth, overjet, short teeth); s / ʃ / f / θ / z shortcuts; live jet readouts (velocity, Reynolds number, share of the jet hitting the teeth). |
| Noise | The physical sources (aspiration, constriction jet, teeth obstacle, release bursts) with trims and pulsing; your own noise: colour (white, pink, brown, blue, violet), a drawable 32-point spectrum, band limits, level, pulsing by the glottal flow, injection point (glottis, constriction, teeth, lips or anywhere along the tract) or straight to the ears (bypassing the tract). |
| Speak | English, Italian, Arabic, Urdu or Hindi text (numbers are read out in English and Italian), or IPA between slashes; rate, accent strength; examples in every language; a phone timeline that follows the playback; "what makes it sound natural": timing, intonation, micro-variation, voice quality and coarticulation, each switchable, with a plain explanation and a one-click robot voice. Arabic and Urdu are read from their script with the vowel marks when written and by rule otherwise (a short vowel between consonants, ا و ي as long vowels, the article assimilated to the sun letters, ے ں ھ as eː, a nasal vowel and aspiration); Hindi from Devanagari (inherent schwa and its deletion, matras, anusvāra, chandrabindu, nukta, virama). |
| Melody | Draw a pitch contour (erase = unvoiced) and play it with the buzz alone or through the current vowel; contour presets (sample sentence, question, flat); a two-octave keyboard (mouse or computer keys) with vibrato. |
| A/B experiment | Nine ready-made experiments (same filter other pitch, same pitch other filter, same vowel another body, dark vs bright, velum closed vs open, one nostril pinched, steady vs pulsed hiss, voice vs whisper, LF vs two-mass) plus your own A/B captures. Each side plays through the live engine, so the head and the views show A or B as you hear it, and the long-term spectra are taken from the samples you heard. |
| Machine voice | Only the excitation of the speech model of the paper Teacher in the Loop, as the paper describes it: nine sines at 1..9 x F0, locked to the pitch, switched off where the melody is zero and replaced by soft noise, mixed by learned weights (here by hand). |

| Output | Volume, sample rate and level; harmonics, filter envelope, log-mel, analysis window; numbers everywhere; freeze the views; the microphone (opt-in, analysed locally, never played back). |

The header holds the three modes, the Sound button (and in the Lab, Hold),
the volume and EN / IT; reset sits at the end of the Lab's chain. On a
desktop the page fits the window, with no page scroll: the header and the
bar at the bottom (Learn's step, Play's controls) stay in view, the stage
takes the height that is left, and whatever is long (a step with its "Why?",
the Lab's inspector) scrolls inside its own panel. On a phone, or a window
less than 640 px tall, the page scrolls as usual.

## Architecture

```
src/
  dsp/                    pure TypeScript, no DOM: runs in the worklet, in tests and in Node
    constants.ts          CGS constants (c, rho, mu, wall parameters)
    glottis/lf.ts         LF model with the Rd parameterisation
    glottis/twoMass.ts    Steinecke-Herzel asymmetric two-mass model
    tract/geometry.ts     mid-sagittal articulatory model, teeth and slit
    tract/section3d.ts    3D cross-sections: lens shapes, perimeter, soft wall, groove, lateral channels, piriform fossae
    tract/areaFunction.ts grid -> area function (44 sections)
    tract/nasal.ts        nasal tract: nasopharynx, left and right passages and nostrils, sinuses
    tract/waveguide.ts    real-time Kelly-Lochbaum waveguide
    tract/acoustics.ts    frequency-domain reference (lossy ABCD chain)
    aero/aero.ts          slow aerodynamics, jets, Reynolds number, obstacle
    noise/noise.ts        turbulence sources and user noise shaping
    engine/engine.ts      the voice engine (one sample loop, telemetry)
    speech/               phonemes (with the retroflex, uvular, pharyngeal, emphatic and aspirated sounds of Hindi, Urdu and Arabic),
                          G2P (it/en, Devanagari in indic.ts, Arabic and Urdu script in arabic.ts), sequencer (aspiration, murmur, nasal vowels, slow motion), target approximation
    analysis/             LPC formants, YIN pitch, mel filterbank
    data/vowels.ts        reference vowel formants
    data/mri.ts           vowel area functions measured by MRI (Story 2008)
  audio/programRunner.ts  what the worklet runs: live parameters, sentences, melodies, clips and samples as programs
  audio/worklet.ts        AudioWorkletProcessor wrapping the program runner
  audio/audioEngine.ts    AudioContext, worklet node, microphone (the voice sink)
  ui/voice/               the voice controller, the only door to the sound: hands, performers, filter lanes, locks
  ui/modes/               Learn, Play, Lab and Tutor layouts, the view frame, the quick controls
  ui/tutor/               the letter tutor's alphabets (letters.ts) and how each sound is made, for a child (guide.ts)
  ui/ds/                  small design system: card, pills, icon button, value with unit
  ui/                     React 19 views, panels, store, i18n, guided tour
  ui/three/meshes.ts      pure mesh builder for the 3D view (tested in Node); three.js loads only with that view
  ui/head/                the illustrated head: the scene (pure, tested in Node) and the painter
public/anatomy/head.jpg   the painted backdrop of the illustrated head
public/video/             the video The Buzz and the Filter (H.264 720p) and its poster frame
tests/                    Vitest suites with the validation numbers
scripts/                  validate.ts, say.ts (renders sentences to WAV), tuning and debug tools
```

Every change to what you hear goes through one object, the voice controller
(`src/ui/voice/voice.ts`). It keeps the hands' parameters (read-only to the
rest of the interface, so the compiler refuses a direct write), knows who
drives each control, refuses an edit to a locked control unless the action
explicitly takes over, and talks to the audio through a small interface (the
voice sink), so the controller, the store and the guided tour are tested in
Node with a fake sink and a fake clock.

The engine runs inside an `AudioWorkletProcessor`. The controller sends the
parameters (coalesced per task) and programs: a sentence or melody score, a
clip of parameters for a few seconds, or ready samples (the machine voice).
A program carries its own parameters and the ones to return to, so the two
never arrive out of order; it ends with an `ended` message carrying its id
(stale ones are ignored), and a 5 ms fade covers the jumps between programs.
The worklet streams the output, the glottal flow and the noise back in blocks
of 1024 samples, plus telemetry (areas, field per section, F0, jet, levels)
about 60 times per second; the views draw what sounds, from that telemetry.
Canvases read a shared ring buffer in `requestAnimationFrame`. Offline renders
(tests, the machine excitation, exports) use the same engine class
synchronously.

The illustrated head keeps the rule that what you see is what sounds. A
painting of the head in section (`public/anatomy/head.jpg`) was generated
from a guide image of the canonical head at rest (`scripts/head-guide.ts`)
and is registered on it: 51.2 pixels per centimetre over a fixed frame. It
was retouched where the painting did not match the model: a dark fringe
along the profile, a translucent velum painted over the pharynx, and a pocket
of air under the tongue that the model fills with tissue. The painting
shows what the model does not move (skull, brain, vertebrae, the nose and
its sinuses, the back wall of the throat, skin and neck); everything that
moves and bounds the air is placed from the geometry of the moment
(`src/ui/head/scene.ts`, pure, tested in Node):

- the painting is cut in bands (neck, cranium, the jaw above and below the
  hinge) that follow the same transform as the geometry, the jaw's rotation
  and the pharynx stretch included, with a zone of triangles under the jaw
  that bends between them as the model's outline does;
- the tongue, the lower incisor and the faces of the lips carry their own
  painting stretched onto their shape of the moment, triangle by triangle
  from the same shape at rest; the palate and the upper teeth are rigid;
- the velum, the air above it, the mucosa behind the lips and wherever the
  painting's air is tissue now are drawn, not painted;
- the air itself is the acoustic channel, drawn last with the sound field,
  so nothing can hide it. A test (`tests/head-overlay.test.ts`) checks, in
  every phoneme's posture and at the ends of each articulator's range, that
  the drawn air is the acoustic channel on every grid line and that no air
  of the painting is left where the model has tissue; and, at rest, that
  the painting sits exactly where it was painted.

The painter (`src/ui/head/painter.ts`) draws the painting and the soft parts
on a layer of its own, painted again only when the posture, the size or the
view changes (about a millisecond on a GPU canvas); each frame then draws
that layer, the glow of the nose, the air and the handles. Until the painting
loads, or if it cannot, the head is drawn in flat shapes.

## The model

Units are CGS throughout (cm, g, s; pressure in dyn/cm², volume velocity in
cm³/s), c = 35 000 cm/s, rho = 1.14e-3 g/cm³.

### Source

**LF model** (Fant, Liljencrants & Lin 1985) of the glottal flow derivative in
one period T0 = 1:

- open phase, 0 <= t <= te: E(t) = E0 e^(alpha t) sin(pi t / tp)
- return phase, te < t <= 1: E(t) = -(Ee / (eps ta)) [e^(-eps (t - te)) - e^(-eps (1 - te))]

with eps ta = 1 - e^(-eps (1 - te)) and alpha such that the flow returns to
zero. The single shape parameter Rd (Fant 1995) sets Ra = (-1 + 4.8 Rd)/100,
Rk = (22.4 + 11.8 Rd)/100, Rg = Rk / (4 (0.11 Rd / (0.5 + 1.2 Rk) - Ra)),
tp = 1/(2 Rg), te = tp (1 + Rk), ta = Ra. Rd 0.3-0.7 is pressed, about 1 modal,
2-2.7 breathy. Advanced mode sets Oq, alpha_m and Ra directly. Cycle-to-cycle
jitter, shimmer and alternate-cycle diplophonia, a posterior chink (incomplete
closure) and vibrato complete the source. Only the AC part of the pulse train
is injected into the tract; the mean flow belongs to the aerodynamic model.
That mean glides over 3 ms: subtracted in one step at each new period (a
shimmer amplitude, a new Rd), it would put a small click on every period, a
broadband fizz above 5 kHz.

**Two-mass model** (Ishizaka & Flanagan 1972, in the asymmetric form of
Steinecke & Herzel 1995):

    m_i x_i'' + r_i x_i' + k_i x_i + H(-a_i) c_i a_i/(2 l) + k_c (x_i - x_j) = F_i
    a_i = a0_i + l (x_left + x_right),   F_1 = l d_1 P_1,   F_2 = 0

Pitch comes from the tension Q (k -> Q k, m -> m / Q); with automatic tension
the model follows the requested F0. Left/right asymmetry gives subharmonics
and raspy voice. The flow is solved each sample against the tract input
impedance, dP = rho U²/(2 a_min²) + (Z + R_visc) U (Titze 1984), so the tract
loads the folds.

**Source-tract interaction** (LF mode): the glottal end reflection of the
waveguide follows the time-varying glottal impedance during the open phase,
which widens F1 and skews the pulses as in real voices.

### Aerodynamics

Lungs -> glottis -> oral constriction (with the nose in parallel) -> out
(Stevens 1998). Each orifice obeys U = A sqrt(2 dP / rho); the cavity behind
the constriction has a compliance C (mostly its walls),

    C dPo/dt = U_glottis - U_mouth - U_nose

This gives intraoral pressure build-up in closures, the release of stops, and
the aerodynamic limit of voicing (no transglottal pressure, no vibration).
Below the speaking pressure (8 cmH2O) the vibration amplitude falls almost in
proportion to the transglottal pressure, so that, with the jet speed, the
voice loses 8-9 dB per halving of the pressure, as measured (Titze & Sundberg
1992): a voiced fricative, with pressure behind its constriction, is much
weaker than its vowels.
Lung and intraoral pressures are smoothed per sample, so a closure never
produces steps. Everything the sample loop takes from the control rate
(pressures, mouth flow, voicing amplitude, glottal opening, the glottal-stop
gate, the noise levels) is carried as a straight line across each 32-sample
control period: held as steps, it would modulate the glottal pulses at
1.5 kHz and leave a comb of whistles at its multiples.

### Vocal tract

**Articulatory geometry** (in the spirit of Maeda 1990 and Birkholz's
VocalTractLab): rigid and deformable structures in the mid-sagittal plane
(posterior pharyngeal wall, velum, hard palate, incisors, lips, jaw, tongue
body and tip) are cut by a semi-polar grid of lines. Each line gives the
distance d between the lower and the upper wall on the midline; across it
the section is a lens between two walls that meet toward the sides,
h(z) = d - K |z|^p, closed laterally by the teeth or the lateral pharyngeal
walls (src/dsp/tract/section3d.ts). Its area is the power law A = alpha d^beta
that X-ray and cast studies fitted region by region (Heinz & Stevens 1965;
Sundberg et al. 1987), with beta = 1 + 1/p; because the shape itself is
modelled, every section also has its true perimeter (a flat passage has far
more wall than a round duct of the same area: 1.9 times for a 1 mm high oral
section), the share of that wall which is soft tissue and yields (tongue,
velum, pharynx, cheeks, lips) or bone and does not (hard palate, teeth), the
central groove of the tongue blade and, in a lateral, the two channels beside
the tongue. The lips (elliptic opening) and the teeth (the explicit slit
between the incisor edges) keep their own shapes. The centreline length is
measured, so lip protrusion and a lowered larynx really lengthen the tube
(and spread lips, protrusion below zero, shorten it). The geometry and the
area function cost about 0.1 ms per update. 14 articulators: jaw, tongue body
x/y, tongue root, tip x/y, blade groove, tongue sides (the margins drawn in
and lowered, for laterals), lip opening, rounding, protrusion, labiodental
tuck, velum, larynx height. The
tongue root moves the back of the tongue below the body centre forward or
back on its own (as Maeda's tongue-shape parameter), fully at the hyoid and
fading toward the dorsum: tense /i/ advances it and widens the lower
pharynx, lax /ɪ ɛ/ pull it back. Its rest position and the epilaryngeal tube
above the glottis (about 0.45 cm², A = 0.55 d^1.3) follow the area functions
measured by MRI (Story 2008), where the lower pharynx of most vowels is about
1 cm². A tucked lower lip keeps its slit under the upper teeth whatever the
jaw, as a closing lip does for a bilabial (motor equivalence), and it slides
out in front of the incisors when it rises above their edge, so that a /v/
on its way to a rounded /w/ ("vuole") never closes. The anatomy (size,
pharynx length and width, nasal leak) is the persistent "person" part of the
filter.

**Waveguide** (Kelly & Lochbaum 1962): 44 equal sections of pressure waves
with one sample of delay each, run at fs_t = N c / L (88 kHz for 17.5 cm), so
any tract length is exact. Junctions:

    r = (A1 - A2)/(A1 + A2),  w = r (f_in - b_in),  f_out = f_in + w,  b_out = b_in + w
    three-way (velum, sinus ostia):  p_J = 2 sum(A_i p_i) / sum(A_i),  out_i = p_J - p_i
    dipole source p_s:   f_out += p_s (1 + r)/2,  b_out -= p_s (1 - r)/2
    monopole source u_s: f_out += rho c u_s / (A1 + A2),  b_out += rho c u_s / (A1 + A2)
    glottal end:         f_0 = r_g b_0 + Z_0 (1 + r_g)/2 U_g
    series resistance R: q = 2 (f_in - b_in) / (1/A1 + 1/A2 + R/(rho c)),
                         f_out = b_in + q/A2,  b_out = f_in - q/A1

Losses: per-section decay exp(-sigma/fs) with sigma = 70 + 45 X sqrt(3/A) s⁻¹,
where X = P / (2 sqrt(pi A)) is the perimeter of the section relative to a
round one of the same area (1 for a circle, at most 8): narrow and flat
sections lose more. Calibrated against the frequency-domain model, which
takes the same perimeters for its viscous and thermal losses.
Yielding walls: a mass-spring-damper per section pair (Ishizaka, French &
Flanagan 1975: m = 1.5 g/cm², r = 1600 dyn s/cm³, k = 3e5 dyn/cm³) removes
air as a flow sink over the soft part of the wall only (in /i/ half of the
wall under the hard palate, the tongue; all of it in the pharynx; none at the
incisal slit), which raises F1 in closed tracts and sets the low-frequency
bandwidths. Lips and nostrils: Flanagan's piston radiation
impedance (parallel R-L) as a first-order reflection filter (bilinear
transform); the sound is the time derivative of lip plus nostril flow. Areas,
losses and radiation coefficients glide sample by sample between control
updates, so articulations never click. Jet losses: where the flow leaves a
narrow passage (the constriction of a fricative, the slit between the
incisors, the lips) it separates into a jet that loses its kinetic pressure in
the wider part downstream (Borda-Carnot), dp = rho/2 v² (1 - A/A_down)². For
the sound this is a series resistance R = rho U (1 - A/A_down)² / A² at that
junction, with the mean flow U of the aerodynamic model (Birkholz, Jackèl &
Kröger 2007; Stevens 1998). The air always leaves the lips into open air,
so the lips carry the whole exit loss, R = rho U / A², even when a passage
just behind them is narrower. It widens the resonances around a fricative
several times (the sharpest one below 4 kHz in /ʃ/ 3.6 times at
600 cm³/s) and those of a vowel hardly at all (1.15 times in /i/ at
150 cm³/s). The output is low-passed (8th-order
Butterworth) and resampled to the audio rate with Catmull-Rom interpolation.

**Nasal tract**: 28 sections (about 11 cm, scaled with the speaker) with the
area profile of Dang, Honda & Suzuki (1994), joined at the velopharyngeal
port. The first 7 sections (the nasopharynx) are common; at the choanae a
three-way junction splits them into the left and right passages, each with
half the area and its own radiating nostril. Two equal passages sound like
the merged tube; unequal ones add a pole-zero pair (Dang et al. 1994): with
one side congested by the nasal cycle (the turbinates of one side swell
while the other side's shrink, every few hours) /m/ gains a resonance near
2.2 kHz with its antiresonance. A pinched nostril closes its passage, which
becomes a closed side branch: a new antiresonance near 560 Hz, and the first
resonance of /m/ falls from about 320 to 240 Hz. With both pinched the air of
a held /m/ has no way out (the aerodynamics take the nostril area too): the
mouth pressure rises to the lung pressure and the hum dies. The maxillary
sinuses (one per side) and the sphenoidal sinus (on the nasopharynx) are
neck + closed cavity side branches, resonating near 450-650 Hz (Dang & Honda
1996). The convoluted turbinates give the passages more wall surface, hence
higher viscous and thermal losses; their walls are bone and cartilage under a
thin mucosa, so unlike the cheeks they hardly yield. With soft walls the
first resonance of the murmur would rise to about 390 Hz; with bony ones it
stays near 310-330 Hz, close to the 250-300 Hz measured in men (Stevens
1998), in both models. The waveguide damps the nose ten times more than the
plain wall losses, which puts a held /m/ 7-9 dB below /a/ (Fletcher 1953).

**Blind branches**: two kinds of cavity open off the main tube and end in a
rigid wall; each joins it at a three-way junction with sections of its own,
and a branch that closes or moves to another junction restarts from silence.
The piriform fossae, two pouches beside the larynx (about 1.8 cm deep in
adult men, 2.35 cm effective here, 1.4 cm² together at the opening and
0.5 cm² at the bottom), open where the epilaryngeal tube ends: they put an
antiresonance at 4-5 kHz into every vowel and lower the formants below it
(Dang & Honda 1997), here 4470-4490 Hz and 23-27 dB deep. Filled halfway with
water, as in Dang and Honda's experiment (Tract & person: piriform fossae, air
inside), the valley rises to about 8 kHz. In a lateral the tip closes on the
midline and the air flows past both sides of the tongue, through channels of
0.1-0.5 cm² a side (Narayanan, Alwan & Haker 1997; here 0.52 cm² both
together); the lumen between the margins of the tongue, from where the
channels split off to the contact, is the supralingual cavity (3.1 cm in
Zhang & Espy-Wilson 2004; here 2.5 cm in /l/, 3.4 cm in /ɫ/), with its
antiresonance between F3 and F4: 3490 Hz in /l/, 3960 Hz in /ɫ/.

**Frequency-domain reference** (Sondhi & Schroeter 1987; Story, Titze &
Hoffman 1996): the same area function as a chain of lossy ABCD sections with
viscous, thermal and wall losses and the radiation load. It draws the filter
envelope and formants in the UI and validates the waveguide, with the same
jet resistances: for the obstacle noise of /ʃ/ the two give the same spectrum
within 1.1 dB in every band from 0.5 to 8 kHz. On the 11 vowel
area functions Story (2008) measured by MRI (one adult man, 44 sections) it
gives the formants he computed from them within 4.8 % (F1), 2.2 % (F2) and
0.8 % (F3) on average.

**Measured shapes** (src/dsp/data/mri.ts): those 11 MRI area functions can be
loaded as the tube and heard. The articulatory vowels are fitted to them
(scripts/fit-mri.ts): among the many tract shapes that give a vowel its
reference formants, the fit chooses the one closest to the measured shape
(log areas compared along the tract, lips left out because MRI segments them
poorly), with the measured tract length and typical jaw openings, and never
a passage narrower than the measured one (it would hiss and throttle the
airflow). The shape distance falls from 0.98 with the drawing's own vowels
to 0.59 (0.1 means areas within about 10 %); the formants stay on target.

### Turbulence noise

At the narrowest oral passage a jet forms with v = sqrt(2 Po / rho) and
hydraulic diameter D = 4 A / P, with the true perimeter P of the passage
(2 sqrt(A / pi) for a round one, about twice the height of a slit). Noise
starts when the Reynolds number
Re = v D / nu passes about 1800 (smooth onset). Sources (Stevens 1971, 1998;
Flanagan & Cherry 1969; Shadle 1985):

- **Constriction (wall) source**: a dipole at about 0.5 cm downstream of the
  constriction exit, strength proportional to rho v³ / c times sqrt(A)
  (Stevens' U³ A^-2.5 law).
- **Obstacle (teeth) source**: the jet keeps its speed along a potential
  core (5 D for a round passage, shorter for a flat one), then slows: like
  1/sqrt(x) while it is flat, like 1/x once it is about five widths long and
  has turned round (Sforza, Steiger & Trentacoste 1966). It spreads
  (width about D + 0.22 x); the share that hits the incisors is
  1 - slit height / jet width. That share, with the velocity at the teeth,
  sets a stronger dipole at the teeth. This is what makes /s/ and /ʃ/ louder
  and sharper than /f/ and /θ/, and why opening the incisal slit weakens /s/.
- **Aspiration**: turbulence of the glottal jet, from the glottal Reynolds
  number, pulsed by the glottal flow (as in real voices) or steady.
- **Release burst**: a monopole at the constriction proportional to the change
  of the mouth flow when a closure opens.

Each noise is Gaussian white noise through a first-order high-pass (dipoles
radiate little at low frequency) and a first-order low-pass at the Strouhal
corner f_c = 0.15 v / D, then filtered by the part of the tract in front of
it (the same source model as VocalTractLab, Birkholz 2014).

**Sibilant shapes.** The spectrum of /s/ and /ʃ/ is mostly the cavity in front
of the incisors and the constriction. A /ʃ/ with its constriction 2.5 cm
behind the teeth and long, nearly closed lips had a front cavity of 5.4 cm:
its lowest resonance, near 1.2 kHz, carried as much energy as the 3-4 kHz
band and pulled the spectral mean down to 3.1 kHz. scripts/tune-sibilant.ts
fits the articulation on the frequency model (fast, many starting points,
the place kept behind the alveolar ridge) to the peak and mean measured on
real speakers (Jongman et al. 2000), then checks the rendered sound: tongue
a little forward, a deeper groove, lips more protruded.

**Your noise**: a white, pink, brown, blue or violet base, or a spectrum you
draw on 32 log-spaced points (50 Hz - 16 kHz), band-limited, at a chosen level,
optionally pulsed by the glottal flow, injected at the glottis, the
constriction, the teeth, the lips or any point of the tract, or sent straight
to the ears to compare it with what the tract makes of it.

### Teeth and the slit

The incisors are explicit structures. The slit between their edges has a
width (default 22 mm), a height set by the jaw plus an extra opening, a
central diastema, and can be moved by overjet, advance and incisor length.
The slit area enters the area function at the teeth, and its height sets the
obstacle share above. The tongue groove narrows the blade channel for
sibilants. The teeth panel draws the front and side views with the live jet.

### Speech

- **Phonemes**: 14 steady vowels (Italian and English, with the r-coloured
  /ɝ/), the American diphthongs /eɪ aɪ oʊ aʊ ɔɪ/ (a nucleus that glides to its
  offglide), unstressed /ɚ/ and 30 consonants, each a set of articulator
  targets plus source settings (voicing, abduction). Vowel articulations were
  fitted so that the frequency-domain model hits adult male targets: Peterson
  & Barney (1952) where available, Hillenbrand et al. (1995) for Italian
  /e o/, Italian /a/ between /æ/ and /ɑ/, and the uniform tube for /ə/; the
  eleven vowels Story (2008) measured also take his MRI shapes (see Measured
  shapes), and /a ə/ keep their narrowest passage at 0.3 cm² or more. The
  consonants that place the tongue body (s z ʃ ʒ k g ŋ ɲ l ʎ ɫ ɹ j w and /ɝ/)
  keep the root forward, the wide pharynx they were tuned with. The
  American /ɹ/ and /ɝ/ have the tip up and back with rounded lips, which
  pulls F3 down to about 1600-1750 Hz (scripts/tune-rhotic.ts), with the
  narrowest passage kept at 0.3 cm² on the fine grid the aerodynamics uses:
  narrower, the jet turns them into fricatives that hiss; the dark /ɫ/
  of English codas backs the tongue body (F2 about 1000 Hz). The clear /l/
  sets its own tongue body: its air flows around the sides of the tongue,
  which a one-dimensional tube cannot show, and a high vowel next to it
  would otherwise close the passage. The nasal consonants open the
  velopharyngeal port to about 0.4 cm²: in running speech the velum parts
  from the pharyngeal wall by only 2-4 mm, against about 10 mm in a breath,
  across a port 12-28 mm wide (X-ray films of sentences, Laprie, Elie &
  Tsukanova 2015); the 1.6 cm² of the velum fully lowered is the breath.
  The velar nasal /ŋ/ closes against the
  oral face of the lowered velum, in front of the velopharyngeal port;
  further back it would cut the nose off too. /s z/ spread the lips back
  against the teeth (lip protrusion below zero): the short cavity in front of
  the groove puts the hiss where it is measured, and a rounded neighbour
  cannot stretch it down to a lisp. Gestures that cannot be held:
  the tap /ɾ/ (one flick of the tongue tip) and the glottal stop /ʔ/ (the
  folds pressed shut).
- **Italian G2P**: orthography rules (c/g before e/i, ch/gh, sc(i), gn, gl(i),
  qu, z, geminates, silent h, intervocalic s voiced in the northern norm,
  ɲ ʎ ʃ ts dz always long between vowels, penultimate stress unless an accent
  is written); unstressed function words (articles, clitics, prepositions);
  numbers in words (ventitré, centottantuno).
- **English G2P** (src/dsp/speech/english.ts): an American lexicon of 89 321
  words with primary and secondary stress, loaded on demand (0.69 MB,
  gzip-compressed; built by scripts/build-lexicon.ts from the gold dictionary
  of the misaki G2P, hexgrad, Apache-2.0); weak forms of function words
  (a, of, to, and...) and "the" before a vowel; inflections of known words
  (-s, -ed, -ing, -er, -ly...) with their voicing rules; compounds split into
  known words; for anything else, letter-to-sound rules in the style of
  Elovitz et al. (1976) with a simple stress rule; numbers and years in words.
  Flaps ("water"), glottal stops ("button"), dark l and r-coloured vowels come
  from the lexicon's American forms. Across words, inside a phrase, a final
  /t d/ links the American way: a flap between vowels ("it is", "get up"), a
  /t/ held by a glottal stop and not released before a consonant ("it
  rains": the folds close with the tongue, so no pressure builds up behind
  it), dropped between consonants ("just two").
- **IPA** between slashes, with ˈ ˌ and ː.
- **Sequencer** (src/dsp/speech/sequencer.ts): the phones are syllabified
  (legal onsets, geminates close the syllable before), grouped into words and
  phrases (commas, full stops, questions), and turned into a gestural score.
  Each ingredient of natural speech can be switched off in the speak panel:
  - *Timing*: English durations follow Klatt (1979): every sound has an
    inherent and a minimum duration, and multiplicative rules scale the
    compressible part (phrase-final lengthening x1.4, non-final shortening,
    polysyllabic and unstressed shortening, the next consonant: x1.6 before a
    voiced fricative, x0.7 before a voiceless stop, cluster shortening).
    Italian uses rules of the same form: stressed vowels long in open
    syllables (x1.55) and short before a geminate or a coda, unstressed and
    function-word vowels short, geminates x1.85, phrase-final lengthening.
  - *Intonation*: the Fujisaki model (Fujisaki & Hirose 1984): ln F0 = ln Fb
    + phrase commands (impulses through α² t e^(-αt), α = 2/s: the slow rise
    and declination of each phrase) + accent commands (steps through
    1 - (1 + βt) e^(-βt), capped at 0.9) on the stressed syllables of content
    words, 5 semitones by default, with a gentle downstep (x0.9 per accent,
    never below 60 %). Each command lasts at least 130-170 ms, so that short
    syllables still reach their peak. English accents rise through the
    stressed syllable and peak inside its vowel; Italian prenuclear accents
    peak late (L+H*), at the end of the vowel rather than on the next
    consonant, where a voiceless sound would hide them; the statement nucleus
    falls onto the stressed syllable (H+L*). The engine follows this curve
    with only a 6 ms smoothing (a slider gets 25 ms), so the accents keep
    their height. Statements end with a final
    lowering, yes/no questions rise, questions with a question word fall, a
    comma leaves a small continuation rise.
  - *Micro-variation*: intrinsic F0 of vowels (+0.7 st for i u, -0.5 st for
    a), the push of the previous consonant on the vowel onset (+1.3 st after a
    voiceless obstruent, -0.8 st after a voiced one, decaying in 35 ms), and
    flutter, the slow F0 wander of Klatt & Klatt (1990): F0 (1 + FL/5000 (sin
    2π 12.7 t + sin 2π 7.1 t + sin 2π 4.7 t)), FL = 25.
  - *Voice quality*: more lung pressure (+14 %) and a tenser source (Rd -0.12)
    on stressed syllables; lower pressure and a breathier source (Rd +0.55)
    over the last 280 ms of each phrase; quiet pauses (the lungs hold back
    instead of blowing through the open glottis). The utterance starts with
    the folds already together, so there is no breathy onset, and ends when
    the last sound ends, without a trailing breath.
  - *Coarticulation*: consonants only set the articulators they need; the
    others are interpolated from the neighbouring vowels (Öhman 1966), so lips
    round ahead of /u/ and the tongue glides through /p/. After a consonant,
    the articulators it used are released at once toward their next target
    (the tip leaves the ridge, the lip the teeth) instead of drifting back
    through the following sounds, where they would close the tract again.
    Off: every sound sets every articulator.
  Consonant gestures are timed so that their sound happens when planned
  (scripts/landmarks.ts): fricatives, nasals and approximants start 20 ms
  ahead and overlap the vowel before, so a 50 ms /v/ still reaches its slit;
  stops aim beyond the contact and close in time anyway. Every consonant lets
  its target go just before the planned release, earlier for the slower
  articulators (tongue body, jaw, velum, in proportion to their time
  constants), so that all of them open together. In the tract model the
  tucked lower lip of /f v/ rises to the upper teeth whatever the jaw (motor
  equivalence, as for bilabial closure). The result: nasals dip 7-15 dB below
  their vowels (the /m/ of "mamma", beside an open /a/, the most) and /v/
  13-20 dB, as in the relative intensities of speech sounds (Fletcher 1953;
  Fry 1979).
  The middle of a vowel belongs to the vowel: the tongue tip, the tongue
  body and the velum may head for the next consonant only from 0.75 of their
  time constant before it. Otherwise a short vowel between alveolars was
  said with the tip already up (an r-coloured, retroflex vowel: /i/ F3 2360
  Hz instead of 2990), one before a velar with the dorsum on its way there,
  and one before a nasal through a port of up to 1 cm². English is the
  exception for the velum: it lowers it from the start of a vowel before a
  nasal, and the nasalized vowel is part of the word (Cohn 1990); Italian
  keeps the vowel oral. A short vowel would also end before the slow
  articulators (tongue body, jaw, lips) reach it, since the tongue body
  needs about 85 ms for 90 % of its way: like a speaker who means to reach
  it, the sequencer aims past the vowel, by as much as the engine's own
  dynamics, run ahead of time, say it falls short, at most 0.6 of the way
  and never outside the articulator's range. Vowels still fall a little
  short where the range ends (/u/ after /j/, /i/ after /ɹ/), as real ones
  do in fast speech (Lindblom 1963). scripts/context.ts measures every vowel
  of 15 English and Italian sentences in its middle against the same vowel
  held: front vowels reach 99 % of their F2 on average (94 % before), 97 %
  at the 10th percentile (77 %); the tip in vowel middles is at 0.24 at the
  90th percentile (1.05); the tongue body misses its target by 0.04 (0.15);
  vowels with an F3 150 Hz below their own fell from 23 % to 6 % (after
  /ɹ/, and before /l/ in Italian); the port in vowels away from nasals is
  shut, and averages 0.05 cm² next to one (0.20).
  Stops are split into closure and release. English voiceless stops at the
  start of a stressed syllable (not after /s/) keep the glottis open past the
  release: aspiration, a voice onset time of about 60-70 ms. Italian ones
  (and English ones after /s/) are unaspirated: the folds stay apart through
  the closure and come together just after the burst, so the voice returns
  after a short lag, shortest for /p/ and longest behind the slower release
  of the tongue body for /k/ (12, 21 and 25 ms; Italian voiceless stops are
  short-lag, under about 30 ms, with /k/ the longest). Taps and trills are ballistic
  raised-cosine flicks of the tongue tip added on top of the smoothed posture
  (one for /ɾ/, two to four contacts at 26 Hz for the Italian /r/, Recasens
  1991); their height is computed from the tip's smoothed position, so they
  really close against the ridge and build up oral pressure. After the last
  sound the mouth relaxes to rest, releasing a final stop. A drawn contour
  replaces the intonation.
- **Target approximation** (Birkholz 2007; Prom-on, Xu & Thipakorn 2009):
  every articulator follows its targets through three identical first-order
  sections (critically damped, no overshoot), with articulator-specific time
  constants (tip faster than jaw).

### Analysis

- Spectrum: Hann-windowed FFT of the output. Predicted harmonics are the LF
  source harmonics times the reference filter |H(f)|.
- Spectrogram: 5 ms hop, window 3-80 ms. Log-mel: 80 triangular bands
  (HTK mel scale, mel = 2595 log10(1 + f/700)), 0-8 kHz, natural log.
- Microphone: LPC formants (autocorrelation, after decimation) and YIN pitch
  (de Cheveigné & Kawahara 2002), shown on the vowel map and spectrum.

## Main parameters

| Parameter | Default | Range | Meaning |
|---|---|---|---|
| F0 | 120 Hz | 40-900 | fundamental frequency |
| lung pressure | 8 cmH2O | 0-20 | drives flow, loudness and noise |
| Rd | 1.0 | 0.3-2.7 | LF shape: pressed to breathy |
| peak glottal area | 0.12 cm² | | sets the pulse amplitude |
| chink | 0.01 cm² | 0-0.2 | posterior leak, breathiness |
| abduction | 0 | 0-1 | open glottis (h, voiceless consonants, breathing) |
| source-tract interaction | 0.6 | 0-1 | glottal loading of the tract |
| two-mass tension Q / asymmetry | auto / 0 | | pitch and raspiness |
| jitter / shimmer | 0.4 % / 2 % | | cycle-to-cycle perturbation |
| size (scale) | 1 | 0.62-1.18 | 1 = adult male, about 17.5 cm |
| slit width | 22 mm | | lateral width of the incisal slit |
| losses | 1 | 0.3-3 | multiplier of the waveguide losses |
| noise trims | 0 dB | | per source |

## Validation

`npm run validate` (or `npm test`) reproduces these numbers. Formant targets
in brackets are the adult male targets described under Speech.

| Check | Result |
|---|---|
| Uniform 17.5 cm tube, lossless, ideal open end | 500.0 / 1500.0 / 2500.0 Hz (theory 500 / 1500 / 2500) |
| Same tube, lossy + piston radiation | 523 (B 37) / 1451 (B 34) / 2406 (B 63) / 3370 (B 100) Hz |
| Real-time waveguide on the same tube | 529 / 1452 / 2406 / 3370 Hz |
| Waveguide vs reference, /i/ | 274 / 2191 / 2994 vs 277 / 2192 / 2994 Hz |
| Waveguide vs reference, /a/ | 726 / 1294 / 2593 vs 728 / 1297 / 2594 Hz |
| Waveguide vs reference, /u/ | 305 / 872 / 2245 vs 300 / 873 / 2245 Hz |
| Waveguide vs reference, /ɛ/ /o/ | 526 / 1825 / 2412 and 478 / 896 / 2456 Hz (ref 529 / 1826 / 2415 and 474 / 897 / 2456) |
| Waveguide vs reference, laterals | /l/ and /ɫ/: every peak and valley below 4.5 kHz that stands out by 3 dB or more, the supralingual cavity's and the fossae's included: worst difference 1.0 % |
| Waveguide vs reference, MRI shapes | worst F1-F3 difference 1.3 % over the 11 measured vowels |
| MRI areas, frequency model | mean difference from the formants Story (2008) computed from the same areas: F1 4.8 %, F2 2.2 %, F3 0.8 % |
| Vowel shapes vs MRI | log-area distance mean 0.60, worst /ɔ/ 0.79 (the drawing's own vowels: 0.98); no vowel narrower than the measured one |
| Vowels F1 / F2 (target) | i 277 / 2192 (270 / 2290), ɪ 389 / 1972 (390 / 1990), e 441 / 2028 (440 / 2050), ɛ 529 / 1826 (530 / 1840), æ 645 / 1661 (660 / 1720), a 728 / 1297 (740 / 1300), ɑ 703 / 1106 (730 / 1090), ɔ 549 / 868 (570 / 840), o 474 / 897 (470 / 900), ʊ 440 / 1007 (440 / 1020), u 300 / 873 (300 / 870), ʌ 635 / 1191 (640 / 1190), ə 498 / 1495 (500 / 1500) |
| Flat passages | a 1 mm high oral section has 1.9 times the wall of a round duct of the same area; three times the wall widens B1 of a 17.5 cm tube from 37 to 50 Hz |
| Yielding walls | /i/: 50 % of the wall under the hard palate yields (the tongue), 100 % in the pharynx, none at the incisal slit (8.1 cm of bone) |
| Piriform fossae | antiresonance /a/ 4490 Hz (-27 dB), /i/ 4470 Hz (-23 dB), /u/ 4470 Hz (-26 dB), /ə/ 4480 Hz (-26 dB) (4-5 kHz, Dang & Honda 1997); half filled with water, /a/ 7970 Hz |
| Laterals | /l/: channels 0.52 cm² beside the contact, supralingual cavity 2.5 cm, antiresonance 3490 Hz (-22 dB); /ɫ/: 0.52 cm², 3.4 cm, 3960 Hz (-42 dB) (Zhang & Espy-Wilson 2004: cavity 3.1 cm, antiresonance between F3 and F4) |
| Geometry cost | geometry, 3D sections and area function 0.08-0.12 ms per update, at most one every 2.7 ms |
| 3D view | the cross-sections it draws (a i u l) have the areas of the acoustic model within 0.1 % |
| F1 vs tract length (uniform) | 12 cm 729 Hz, 14.5 cm 603 Hz, 17.5 cm 500 Hz, 20 cm 438 Hz (1/L) |
| /a/ scaled to 0.75 | F2 ratio 1.329 (ideal 1.333) |
| LF spectral slope, Rd 1, 1-5 kHz | -11.8 dB/oct (flow derivative), -17.9 dB/oct (flow) |
| LF H1-H2 | Rd 0.5: -2.0 dB, Rd 1: 3.8 dB, Rd 2.5: 17.5 dB (pressed to breathy) |
| Two-mass F0 vs tension | Q 0.7: 97 Hz, Q 1.2: 165 Hz, Q 1.8: 242 Hz; automatic tension within 4 % of the target |
| /s/ | peak 4875 Hz, centroid 6264 Hz, -9.5 dB re /a/ (male /s/: peak 4-5 kHz, mean 5-6 kHz, Jongman et al. 2000) |
| /ʃ/ | peak 3797 Hz, centroid 3848 Hz, 0.7-1.8 kHz band 7.0 dB below the 2-3.5 kHz band, -5.8 dB re /a/ (3.7 dB louder than /s/; Jongman et al. 2000: peak about 3-4 kHz, mean 4.2 kHz, lower for men) |
| Fricative spectrum, waveguide vs reference | /ʃ/ obstacle source: worst difference 1.2 dB over 8 bands, 0.5-8 kHz |
| Jet losses | the sharpest resonance below 4 kHz widens 4.6 times in /ʃ/ (600 cm³/s), 1.08 times in /i/ (150 cm³/s) |
| /f/ | centroid 7514 Hz, flat (2-10 kHz spread 9.9 dB vs 11.6 dB for /s/), -17.0 dB re /a/, -7.5 dB re /s/ |
| Teeth | opening the incisal slit by 6 mm lowers /s/ in 4-10 kHz by 15.7 dB |
| Breathiness | HF/LF ratio +17.7 dB with a 0.12 cm² chink and Rd 2.2 |
| Aspiration | F0 envelope modulation depth: steady 0.050, pulsed 0.595 |
| Period boundaries | jitter 1 % and shimmer 6 % change the 8-16 kHz energy by +0.1 dB (+32 dB when the pulse mean jumped at each period) |
| Control rate | voice onset from rest: 3-8 kHz at -43.1 dB re 0-1 kHz (-6.5 dB with stepped control values) |
| User pink noise | -2.99 dB/oct (theory -3.01) |
| "sasso" | geminate /sː/ 187 ms vs single /s/ 107 ms; HF/LF +5.1 dB in /sː/ vs -39.5 dB in /a/ |
| "mamma" | nasal murmur 800-3000 / 80-400 Hz balance -36.4 dB vs -10.7 dB in the vowel |
| Nasal murmur, waveguide vs reference | lowest resonance with the same damping /m/ 306 vs 307, /n/ 319 vs 320, /ŋ/ 309 vs 308 Hz (308, 325, 316 Hz with the waveguide's tenfold nasal damping; 392-416 Hz in the reference while it gave the nose soft walls) |
| Nasal cycle | /m/ with one passage congested (cycle 0.6): a new resonance at 2170 Hz with its antiresonance; first resonance 280 -> 270 Hz |
| Pinched nostril | /m/ with the left nostril pinched: first resonance 310 -> 230 Hz, new antiresonance at 550 Hz |
| Asymmetric nose, waveguide vs reference | congested left side, right nostril 40 % open, lossless: worst difference 0.34 % over 6 resonances below 3 kHz |
| Pinched nose | held /m/: nasal airflow 231 -> 0 cm³/s, mouth pressure 8.0 cmH2O (the lung pressure), the hum silent |
| Italian G2P | sasso, mamma, voce, rosa (northern /z/), gnocchi, figlio (long ʎ), scena, chiesa, città; IPA parsing |
| English G2P | 89 321-word lexicon; voice v ɔɪ s, water w ɔ ɾ ɚ, little l ɪ ɾ ə ɫ, 1984 "nineteen eighty four", blick (rules) b l ɪ k; weak forms; wh-questions marked |
| American linking | it is ɪ ɾ ɪ z, get up g ɛ ɾ ʌ p, just two dʒ ʌ s t u; oral pressure behind the /t/ of "it rains" 0.7 cmH2O (glottal stop, no puff) vs 6.6 cmH2O in "it." |
| American r | /ɹ/ 407 / 1103 / 1596 Hz, /ɝ/ 479 / 1315 / 1741 Hz (Peterson & Barney /ɝ/ 490 / 1350 / 1690), narrowest passage 0.3 cm² (no hiss) |
| Dark l | F2 clear /l/ 1506 Hz, dark /ɫ/ 936 Hz |
| Klatt durations | /i/ in bead 223 ms vs beat 153 ms; "heed heed heed": first 121 ms, last 223 ms |
| Italian durations | stressed /a/ in fato 156 ms vs fatto 104 ms |
| Voice onset time | /t/ English 77 ms, after /s/ 21 ms; Italian /p t k/ 12 / 21 / 25 ms (Lisker & Abramson: English /t/ about 70 ms, range 30-105; Italian voiceless stops short-lag, under about 30 ms, /k/ longest) |
| Trill and tap | tongue-tip closures: "carro" 4, "caro" 2 |
| Consonant dips | nasals 7.0-15.0 dB, /v/ 13.2-19.9 dB below their vowels (natural speech: nasals 6-12 dB, voiced fricatives 12-20 dB; 8.3-17.7 dB without the jet losses) ("la mamma vuole la nonna e il vino", "Every voice you have ever heard is raining in."); no complete closure in /v w l/, the narrowest /v/ 0.08 cm² (0.03 before the lip could slide out from under the teeth); /ŋ/ in front of the nasal port in every vowel context |
| Vowels in running speech | 15 English and Italian sentences, each vowel in its middle against the same vowel held: front vowels F2 99 % on average, 97 % at the 10th percentile; F3 of non-rhotic vowels 2367 Hz at the 10th percentile, 6.5 % of them 150 Hz below their own (after /ɹ/, before /l/); tip 0.24 at the 90th percentile; F1 100 %; tongue body 0.04 from its target; nasal port 0.002 cm² at most away from nasals, 0.05 cm² on average next to one |
| Fujisaki intonation | final F0: statement 106 Hz, wh-question 101 Hz, yes/no question 180 Hz (base 120 Hz) |
| Melody | "Every voice you have ever heard is made of just two ingredients.": planned F0 range 10.2 st; the voice follows the plan within 0.58 st (90 %), 1.9 st with the slider smoothing |
| Log-mel | 80 bands; a 1 kHz tone lands in band 25-29 |

## Simplifications and limits

- The head is a canonical adult male mid-sagittal drawing. Its vowels are
  fitted to the MRI shapes of one speaker (Story 2008) as far as its
  articulators allow (shape distance 0.60, not 0); the consonants are not.
  With the 3D sections /i/ reaches F2 2192 Hz against 2290 (2260 before):
  the fit stops at the limits of the tongue root and the lips, and a
  narrower palatal passage than the measured one is not allowed; /æ/ and
  /ɑ/ are 2-4 % off in F2 or F1.
  The cross-sections are lenses with analytic lateral profiles (a palatal
  vault, the teeth at the sides, the tongue with its groove and margins), not
  shapes measured slice by slice; the tract is still one tube of plane waves
  along its centreline (see below). Each grid line takes one air
  passage; where the tip of the lower lip enters the gap above the lower
  incisors and splits it, the area and the midpoint pass smoothly from the
  whole gap to the one between the lips while the lip on the line is thinner
  than 3 mm, and a gap from the lower incisors to the upper lip is as wide as
  the lips (largest F1/F2 step of /u/ 0.6 % per 0.005 of lip opening, 4.5 %
  before). The front end of the tract still moves by whole grid lines: when
  the upper lip comes down onto the last line the tract grows by 1.5 mm and
  the formants step by about 1 % (/ʊ/).
- The epilaryngeal tube has a fixed width: real speakers narrow it for a
  pressed voice and widen it for a breathy one.
- A held /u/ is probably too weak: 11 dB below /a/, against 4.7 dB for /i/,
  where natural speech has close vowels only a few dB below open ones. Its
  first resonance is damped by the soft walls, which also lift it from
  208 Hz (rigid walls) to 304 Hz: the bandwidth is 108 Hz in both acoustic
  models, against about 70 Hz measured for close vowels with the glottis
  closed (Fujimura & Lindqvist 1971; /i/ here 79 Hz). The jet losses at the
  velar passage and the lips (0.15 and 0.19 cm², as in the MRI shape) take
  about 2 dB more. The wall constants (Ishizaka, French & Flanagan 1975)
  are the same for every vowel.
- One-dimensional plane-wave acoustics: no cross modes (fine below about
  5 kHz for an adult tract), no 3D flow. The noise sources are lumped dipoles
  with laws and constants calibrated to match measured fricative levels and
  spectra; the jet is not simulated as a flow field. The jet losses use the
  mean flow of the single oral constriction the aerodynamic model knows; the
  slit and lip losses do not feed back into that flow.
- The consonant postures are fitted to formants and fricative spectra, not to
  measured area functions. The laterals keep their contact, channels and
  supralingual cavity, but their F3 stays low: /l/ 2421 Hz and /ɫ/ 2254 Hz
  against about 2600 measured. The palatal /ʎ/ has its lateral channels but
  no midline contact, so no supralingual cavity.
- The piriform fossae have the dimensions of an average adult man, scaled
  with the speaker; real ones differ from person to person, and from the
  left to the right side.
- The nasal branch has a fixed number of sections that scales with the
  speaker. Its damping in the waveguide is set by the level of /m/, not by
  measured bandwidths: the murmur's peaks are wider than in the frequency
  model, which keeps the plain wall losses (the resonance frequencies agree).
  No frontal or ethmoid sinuses; a pinched nose is silent (no sound through
  the tissues).
- The slow aerodynamics run at control rate (every 32 samples), ramped
  linearly in the sample loop; a strong closure damping term keeps closed
  cavities stable.
- The two-mass model is the 4-mass asymmetric form without collision
  dynamics beyond the contact spring.
- English pronunciation is American only; unknown words use letter-to-sound
  rules, which miss many irregular spellings. Homographs (read, live) take one
  pronunciation. Italian open and close e/o are only known where an accent is
  written. Prosody is rule-based: it has no idea which word the sentence is
  about, so the nuclear accent always falls on the last content word.
- The machine-voice tab describes only the excitation as the paper Teacher in
  the Loop presents it; it does not model any trained network.
- The colourful field and particle visualisations are illustrative (the
  colours follow the real per-section pressure / velocity / flow, the
  particles are decorative). In the 3D view the air has the cross-sections
  the sound is computed with, one colour across each section as plane waves
  have; the tissues around it are sheets of a fixed thickness and the teeth
  are boxes along a typical dental arch, drawn for orientation.
- The illustrated head is one painting of an adult man, scaled for the other
  sizes. The painting under the tongue (the floor of the mouth, the hyoid)
  stays with the jaw and the neck, so a tongue root pushed far back or
  forward leaves a visible step below the tongue; the soft parts the model
  adds where the painting had air are plain mucosa.

## References

- Abbs, J. H. & Gracco, V. L. (1984). Control of complex motor gestures. J. Neurophysiol. 51.
- Birkholz, P. (2007). Control of an articulatory speech synthesizer based on dynamic approximation of spatial articulatory targets. Interspeech.
- Birkholz, P. (2014). Enhanced area functions for noise source modeling in the vocal tract. 10th International Seminar on Speech Production, Cologne.
- Birkholz, P., Jackèl, D. & Kröger, B. J. (2007). Simulation of losses due to turbulence in the time-varying vocal system. IEEE Trans. Audio, Speech, and Language Processing 15.
- Dang, J., Honda, K. & Suzuki, H. (1994). Morphological and acoustical analysis of the nasal and the paranasal cavities. JASA 96.
- Dang, J. & Honda, K. (1996). Acoustic characteristics of the human paranasal sinuses derived from transmission characteristic measurement and morphological observation. JASA 100.
- Dang, J. & Honda, K. (1997). Acoustic characteristics of the piriform fossa in models and humans. JASA 101.
- de Cheveigné, A. & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music. JASA 111.
- Fant, G. (1960). Acoustic Theory of Speech Production. Mouton.
- Fant, G., Liljencrants, J. & Lin, Q. (1985). A four-parameter model of glottal flow. STL-QPSR 4.
- Fant, G. (1995). The LF-model revisited. Transformations and frequency domain analysis. STL-QPSR 2-3.
- Flanagan, J. L. (1972). Speech Analysis, Synthesis and Perception, 2nd ed. Springer.
- Flanagan, J. L. & Cherry, L. (1969). Excitation of vocal-tract synthesizers. JASA 45.
- Heinz, J. M. & Stevens, K. N. (1965). On the relations between lateral cineradiographs, area functions and acoustic spectra of speech. ICA 5.
- Hillenbrand, J., Getty, L. A., Clark, M. J. & Wheeler, K. (1995). Acoustic characteristics of American English vowels. JASA 97.
- Ishizaka, K. & Flanagan, J. L. (1972). Synthesis of voiced sounds from a two-mass model of the vocal cords. Bell Syst. Tech. J. 51.
- Ishizaka, K., French, J. C. & Flanagan, J. L. (1975). Direct determination of vocal tract wall impedance. IEEE Trans. ASSP 23.
- Kelly, J. L. & Lochbaum, C. C. (1962). Speech synthesis. Proc. 4th Int. Congr. Acoustics.
- Maeda, S. (1990). Compensatory articulation during speech. In Speech Production and Speech Modelling. Kluwer.
- Narayanan, S. S., Alwan, A. A. & Haker, K. (1995). An articulatory study of fricative consonants using magnetic resonance imaging. JASA 98.
- Narayanan, S. S., Alwan, A. A. & Haker, K. (1997). Toward articulatory-acoustic models for liquid approximants based on MRI and EPG data. Part I. The laterals. JASA 101.
- Öhman, S. E. G. (1966). Coarticulation in VCV utterances. JASA 39.
- Peterson, G. E. & Barney, H. L. (1952). Control methods used in a study of the vowels. JASA 24.
- Prom-on, S., Xu, Y. & Thipakorn, B. (2009). Modeling tone and intonation in Mandarin and English as a process of target approximation. JASA 125.
- Recasens, D. (1991). On the production characteristics of apicoalveolar taps and trills. J. Phonetics 19.
- Elovitz, H. S., Johnson, R., McHugh, A. & Shore, J. E. (1976). Automatic translation of English text to phonetics by means of letter-to-sound rules. NRL Report 7948.
- Espy-Wilson, C. Y., Boyce, S. E., Jackson, M., Narayanan, S. & Alwan, A. (2000). Acoustic modeling of American English /r/. JASA 108.
- Fujisaki, H. & Hirose, K. (1984). Analysis of voice fundamental frequency contours for declarative sentences of Japanese. J. Acoust. Soc. Jpn. (E) 5.
- Klatt, D. H. (1979). Synthesis by rule of segmental durations in English sentences. In Frontiers of Speech Communication Research. Academic Press.
- Cohn, A. C. (1990). Phonetic and phonological rules of nasalization. UCLA Working Papers in Phonetics 76.
- Laprie, Y., Elie, B. & Tsukanova, A. (2015). 2D articulatory velum modeling applied to copy synthesis of sentences containing nasal phonemes. ICPhS 2015, Glasgow.
- Lindblom, B. (1963). Spectrographic study of vowel reduction. JASA 35.
- Klatt, D. H. & Klatt, L. C. (1990). Analysis, synthesis, and perception of voice quality variations among female and male talkers. JASA 87.
- Lisker, L. & Abramson, A. S. (1964). A cross-language study of voicing in initial stops: acoustical measurements. Word 20.
- Fletcher, H. (1953). Speech and Hearing in Communication. Van Nostrand.
- Fry, D. B. (1979). The Physics of Speech. Cambridge University Press.
- Fujimura, O. (1962). Analysis of nasal consonants. JASA 34.
- Fujimura, O. & Lindqvist, J. (1971). Sweep-tone measurements of vocal-tract characteristics. JASA 49.
- Gick, B., Allen, B., Roewer-Després, F. & Stavness, I. (2017). Speaking tongues are actively braced. JSLHR 60.
- Jongman, A., Wayland, R. & Wong, S. (2000). Acoustic characteristics of English fricatives. JASA 108.
- Jongman, A. (2024). Phonetics of fricatives. Oxford Research Encyclopedia of Linguistics.
- Zue, V. W. & Laferriere, M. (1979). Acoustic study of medial /t, d/ in American English. JASA 66.
- Sforza, P. M., Steiger, M. H. & Trentacoste, N. (1966). Studies on three-dimensional viscous jets. AIAA Journal 4.
- Shadle, C. H. (1985). The acoustics of fricative consonants. PhD thesis, MIT.
- Sondhi, M. M. & Schroeter, J. (1987). A hybrid time-frequency domain articulatory speech synthesizer. IEEE Trans. ASSP 35.
- Steinecke, I. & Herzel, H. (1995). Bifurcations in an asymmetric vocal-fold model. JASA 97.
- Stevens, K. N. (1971). Airflow and turbulence noise for fricative and stop consonants. JASA 50.
- Stevens, K. N. (1998). Acoustic Phonetics. MIT Press.
- Stone, M. (1990). A three-dimensional model of tongue movement based on ultrasound and x-ray microbeam data. JASA 87.
- Story, B. H., Titze, I. R. & Hoffman, E. A. (1996). Vocal tract area functions from magnetic resonance imaging. JASA 100.
- Story, B. H. (2008). Comparison of magnetic resonance imaging-based vocal tract area functions obtained from the same speaker in 1994 and 2002. JASA 123.
- Sundberg, J., Johansson, C., Wilbrand, H. & Ytterbergh, C. (1987). From sagittal distance to area. Phonetica 44.
- Titze, I. R. (1984). Parameterization of the glottal area, glottal flow, and vocal fold contact area. JASA 75.
- Titze, I. R. & Sundberg, J. (1992). Vocal intensity in speakers and singers. JASA 91.
- Young, S. et al. The HTK Book (mel filterbank).
- Zhang, Z. & Espy-Wilson, C. Y. (2004). A vocal-tract model of American English /l/. JASA 115.

## Developer scripts

```bash
npx tsx scripts/say.ts out/            # render example sentences to WAV, print phones, durations and pitch range
npx tsx scripts/say.ts out/ en "any sentence"   # one sentence; add --flat for the robot version
npx tsx scripts/g2p.ts en "the water bottle"    # phones of a text and where each English word came from
npx tsx scripts/trace.ts it "il carro"          # every 2 ms: phone, constriction area, oral pressure, voicing
npx tsx scripts/build-lexicon.ts us_gold.json   # rebuild public/lexicon/en-us.lex
npx tsx scripts/tune-rhotic.ts 490,1350,1690 ɹ  # fit an articulation to F1/F2/F3 with tip and lips free
npx tsx scripts/areas.ts ɹ ɝ j l w              # narrowest passage and formants of each phoneme's posture
npx tsx scripts/melody.ts en "is it raining?"   # planned F0 at each phone
npx tsx scripts/noisemap.ts en "every voice"    # level of each noise source per phone
npx tsx scripts/contrast.ts it "il vino"        # how deep each consonant dips below its vowels
npx tsx scripts/landmarks.ts                    # when constrictions form and open, against the plan
npx tsx scripts/context.ts --base a.json        # vowels in sentences against the same vowels held (--save a.json keeps the measures)
npx tsx scripts/sibilants.ts a.wav b.wav        # peak and spectral mean of the hissing frames of recordings
npx tsx scripts/pitch.ts a.wav b.wav            # pitch track, level and F0 spread of recordings
npx tsx scripts/hnr.ts a.wav b.wav              # harmonics-to-noise ratio, full band and above 2 kHz
npx tsx scripts/specpng.ts out.png a.wav b.wav  # stacked spectrograms with pitch tracks
npx tsx scripts/explore.ts a out.wav   # one phoneme: level, F0, LPC formants
npx tsx scripts/tune-vowels.ts a --keys=jaw,tongueX,tongueY,tongueRoot --minarea=0.3   # fit vowel articulations to reference formants
npx tsx scripts/fit-mri.ts             # fit the vowels to formants and to the MRI shapes (--write updates phonemes.ts)
npx tsx scripts/mri.ts --profiles      # acoustic model on the MRI areas; our vowels against the measured shapes
npx tsx scripts/tune-consonants.ts     # consonant tuning helper
npx tsx scripts/tune-sibilant.ts ʃ 3000 4000   # fit a sibilant to a spectral peak and mean (frequency model, then rendered)
npx tsx scripts/tune-lateral.ts l 350 1500 2600 --robust   # fit a lateral to F1/F2/F3, keeping the contact, the channels and a 2 cm cavity
npx tsx scripts/areas3d.ts i a u l     # narrowest passage, perimeter, hydraulic diameter, channels, formants with and without the piriform fossae
npx tsx scripts/noise-transfer.ts s    # transfer from a noise source at each front junction
npx tsx scripts/scan-variants.ts ʃ '[{"jaw":0.2}]'
npx tsx scripts/debug-geometry.ts geometry.html
npx tsx scripts/head-guide.ts out/      # the guide image the head's painting was generated from
```

In development builds the store is exposed as `window.voiceStore` for
debugging.

## License

Apache-2.0 (`LICENSE`). The American English lexicon is derived from the
Misaki G2P by hexgrad (Apache-2.0): see `NOTICE`. Third-party components and
data are listed in `THIRD_PARTY_NOTICES.md`.

# Third-party notices

This repository is licensed under Apache-2.0 (`LICENSE`). Attribution for the lexicon derived from Misaki is in
`NOTICE`.

## Included in this repository

| component | license | where | used for |
|---|---|---|---|
| Misaki by hexgrad: the American English "gold" dictionary `us_gold.json` | Apache-2.0 | https://github.com/hexgrad/misaki | `public/lexicon/en-us.lex`, the pronunciations of the speak panel (changes listed in `NOTICE`) |

## Bundled in the built site

`npm run build` bundles these packages into `dist/`; they are installed by npm, not copied into this
repository.

| component | license | where |
|---|---|---|
| three.js by mrdoob and contributors | MIT | https://github.com/mrdoob/three.js |
| React and React DOM by Meta Platforms, Inc. and affiliates | MIT | https://github.com/facebook/react |

The development tools (Vite, Vitest, TypeScript, tsx and their dependencies) keep their own licenses; see the
installed package metadata.

## Measurements from the literature

`src/dsp/data/mri.ts` holds the vowel area functions published in Story, B. H. (2008), "Comparison of magnetic
resonance imaging-based vocal tract area functions obtained from the same speaker in 1994 and 2002", JASA 123.
Other constants come from the papers listed under References in `README.md`, each cited where it is used.

## Video

`public/video/the-buzz-and-the-filter.mp4` (and its poster frame) was made for this project and is licensed with
it. The narration is spoken by the af_heart student of the paper Teacher in the Loop
(https://github.com/MithrilMan/teacher-in-the-loop, Apache-2.0), itself trained on Kokoro-82M by hexgrad
(https://huggingface.co/hexgrad/Kokoro-82M, Apache-2.0) and built on the Paradee architecture
(https://github.com/sahilmahendrakar/paradee, Apache-2.0). The animations were rendered with Manim Community
(https://www.manim.community, MIT); the music was synthesized for the video. The captions use Noto Sans (SIL Open
Font License 1.1). The end card of the video carries the same credits.

## Images

`public/anatomy/head.jpg` is a painting generated from the guide image of `scripts/head-guide.ts` and retouched
to match the model (see Architecture in `README.md`). It and the images in `public/img/` are part of
this project and are licensed with it.

## Face Cap head (the tutor's mirror)

`public/models/facecap.glb` is the "Face Cap" head with ARKit blend shapes by
Bannaflak, as distributed with the three.js examples
(https://github.com/mrdoob/three.js/tree/r186/examples/models/gltf, file
`facecap.glb`). `public/basis/` holds the Basis Universal texture transcoder
that ships with three.js (`examples/jsm/libs/basis`, Apache-2.0), needed to
read the model's textures.

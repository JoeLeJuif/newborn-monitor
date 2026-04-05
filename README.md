# MiniSynth

Synthétiseur polyphonique jouable dans le navigateur. React + Vite + Tone.js.
Interface claire, lumineuse, moderne. Support MIDI via Web MIDI API.

## Lancer le projet

```bash
cd minisynth
npm install
npm run dev
```

Ouvre `http://localhost:5173` dans ton navigateur.

## Build de production

```bash
npm run build
npm run preview
```

## Fonctionnalités

### Synthétiseur
- **PolySynth** 8 voix — waveforms : sine, square, sawtooth, triangle
- **ADSR** — attack, decay, sustain, release
- **Filtre low-pass** — cutoff + résonance
- **Volume master**

### Effets
- **Delay** — on/off, wet, feedback, time
- **Reverb** (Freeverb) — on/off, wet, room size

### LFO
- Modulation du cutoff filtre
- Waveforms : sine, triangle, square
- Paramètres : on/off, rate (0.1–20 Hz), depth (0–4000 Hz)

### MIDI (Chrome / Edge)
- Détection automatique des périphériques MIDI
- Sélection d'un input parmi plusieurs
- Note on/off avec velocity
- Reconnexion automatique si l'appareil est débranché/rebranché
- Coexistence totale avec clavier ordinateur, souris et séquenceur

### Presets
- 5 presets built-in : Init, Bass, Lead, Pad, Pluck
- Sauvegarde de presets utilisateur (localStorage)
- Chargement / suppression

### Step Sequencer
- 16 pas, boucle sur `Tone.Transport`
- Note sélectionnable par step (C2–B5)
- Velocity par step (0–100%)
- Longueur de note par step (1/32, 1/16, 1/8, 1/4)
- Play / Stop / BPM / Clear / mode Advanced

## Mapping clavier

| Touche | Note | | Touche | Note |
|--------|------|---|--------|------|
| A | C | | W | C# |
| S | D | | E | D# |
| D | E | | T | F# |
| F | F | | Y | G# |
| G | G | | U | A# |
| H | A | | | |
| J | B | | Z/X | Oct ↓↑ |
| K | C+1 | | | |

## Architecture

```
src/
├── audio/
│   ├── synthEngine.js       # PolySynth → Filter → Delay → Reverb → Volume
│   ├── keyMap.js            # Mapping clavier → notes
│   └── midi.js              # Web MIDI API (init, select, messages)
├── presets/
│   └── presets.js
├── components/
│   ├── PianoKeyboard.jsx
│   ├── Controls.jsx
│   ├── WaveSelector.jsx
│   ├── EnvelopeControls.jsx
│   ├── FilterControls.jsx
│   ├── PresetPanel.jsx
│   ├── LFOControls.jsx
│   ├── EffectsControls.jsx
│   ├── StepSequencer.jsx
│   └── MidiPanel.jsx        # Statut MIDI, sélection device, indicateur note
└── App.jsx
```

## Notes MIDI

Web MIDI est disponible nativement dans **Chrome** et **Edge**.
Firefox nécessite une extension (Web MIDI API polyfill).
L'application reste pleinement fonctionnelle sans MIDI.

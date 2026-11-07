# Tools

Two tool folders, split by what they talk to:

| Folder | What lives there |
|---|---|
| `ae_scripts/tools/` | Tools that run against After Effects: `run_jsx.sh` (safe JSX sender), `preflight.py` (ES3 lint), `fx.py` + effect dictionaries (matchName lookup), `dump_*.sh` (export keys/effects from a comp), `run_capture.sh`, `compare_comps.sh`, `clone_effect.sh`, `audit_keyframes.jsx`, `close_comps.jsx`, `dump_project_inventory.jsx` |
| `tools/` | Tools that do not need AE: `fetch_reference.py`, `analyze_reference.py`, `extract_frames.swift`, `browser_frame_sampler.js` (references); `sheet.py`, `measure.py`, `diff_frames.py` (frames and comparisons); `retrospective.py`, `publish_case.sh`, `health_check.py` (repository workflow); `audio_transition_fit.py` |

Each tool exists in exactly one place.

## Audio Transition Fit

`audio_transition_fit.py` creates a replacement music section without requiring
Suno's paid local section replacement feature.

Typical use:

```bash
python3 tools/audio_transition_fit.py \
  --base /path/to/original-video-or-audio.mp4 \
  --replacement /path/to/new-music.mp3 \
  --replace-start 17.8 \
  --replace-end 27.63 \
  --end-at-replace-end \
  --output /path/to/motion-agent-audio-fit.wav
```

The tool keeps the original audio before `replace-start`, cuts a replacement
section of the exact required duration, crossfades the join, and can align the
strongest replacement hit to `replace-end`.

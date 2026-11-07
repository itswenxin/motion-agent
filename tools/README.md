# Tools Directory

`ae_scripts/tools/` is the canonical home for AE-facing tools because it is synced into the live workspace by `sync.sh`.

This `tools/` directory is kept as the stable repo-level entry point for documentation and older commands. When a tool needs AE runtime behavior, prefer either:

- call `ae_scripts/tools/<tool>` directly, or
- keep a small compatibility wrapper here that delegates to `ae_scripts/tools/<tool>`.

Do not maintain two independent implementations of the same AE tool.

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

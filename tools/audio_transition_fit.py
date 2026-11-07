#!/usr/bin/env python3
"""Fit a replacement music section to an existing edit.

The tool keeps the original audio before a cut point, inserts a replacement
section, and optionally aligns a strong hit in the replacement to the target
ending time. It is intentionally deterministic so the same inputs produce the
same output for review and iteration.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


def parse_time(value: str) -> float:
    text = str(value).strip()
    if ":" not in text:
        return float(text)
    parts = [float(part) for part in text.split(":")]
    if len(parts) == 2:
        return parts[0] * 60.0 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600.0 + parts[1] * 60.0 + parts[2]
    raise argparse.ArgumentTypeError(f"Unsupported time value: {value}")


def run(command: list[str]) -> None:
    try:
        subprocess.run(command, check=True, text=True, capture_output=True)
    except subprocess.CalledProcessError as err:
        stderr = (err.stderr or err.stdout or "").strip()
        raise RuntimeError(stderr or f"Command failed: {' '.join(command)}") from err


def require_ffmpeg() -> None:
    missing = [name for name in ("ffmpeg", "ffprobe") if not shutil.which(name)]
    if missing:
        raise RuntimeError("Missing command(s): " + ", ".join(missing))


def load_audio(path: Path, sample_rate: int) -> np.ndarray:
    require_ffmpeg()
    with tempfile.TemporaryDirectory(prefix="motion-agent-audio-") as tmp:
        wav = Path(tmp) / "input.wav"
        run([
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(path),
            "-vn",
            "-ac",
            "2",
            "-ar",
            str(sample_rate),
            str(wav),
        ])
        data, actual_rate = sf.read(wav, always_2d=True, dtype="float32")
        if actual_rate != sample_rate:
            raise RuntimeError(f"Unexpected sample rate {actual_rate}; expected {sample_rate}")
        return data


def write_audio(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix in (".wav", ".aiff", ".aif", ".flac", ".ogg"):
        sf.write(path, np.clip(audio, -1.0, 1.0), sample_rate)
        return
    require_ffmpeg()
    with tempfile.TemporaryDirectory(prefix="motion-agent-audio-out-") as tmp:
        wav = Path(tmp) / "mix.wav"
        sf.write(wav, np.clip(audio, -1.0, 1.0), sample_rate)
        codec_args = ["-codec:a", "libmp3lame", "-q:a", "2"] if suffix == ".mp3" else ["-codec:a", "aac", "-b:a", "256k"]
        run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), *codec_args, str(path)])


def seconds_to_samples(seconds: float, sample_rate: int) -> int:
    return max(0, int(round(seconds * sample_rate)))


def samples_to_seconds(samples: int, sample_rate: int) -> float:
    return samples / float(sample_rate)


def mono(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return audio
    return np.mean(audio, axis=1)


def find_strong_hit(audio: np.ndarray, sample_rate: int, search_start: float, search_end: float) -> Optional[float]:
    y = mono(audio)
    duration = len(y) / float(sample_rate)
    start = max(0.0, min(search_start, duration))
    end = max(start, min(search_end, duration))
    if end - start < 0.15:
        return None

    start_sample = seconds_to_samples(start, sample_rate)
    end_sample = seconds_to_samples(end, sample_rate)
    window = y[start_sample:end_sample]
    if len(window) < sample_rate // 4:
        return None

    onset_env = librosa.onset.onset_strength(y=window, sr=sample_rate)
    if len(onset_env) == 0:
        return None
    times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sample_rate)
    idx = int(np.argmax(onset_env))
    return float(start + times[idx])


def estimate_bpm(audio: np.ndarray, sample_rate: int) -> Optional[float]:
    y = mono(audio)
    if len(y) < sample_rate:
        return None
    tempo = librosa.feature.tempo(y=y, sr=sample_rate)
    if len(tempo) == 0 or not math.isfinite(float(tempo[0])):
        return None
    return float(tempo[0])


def equal_power_fade(length: int) -> tuple[np.ndarray, np.ndarray]:
    if length <= 0:
        return np.array([], dtype=np.float32), np.array([], dtype=np.float32)
    x = np.linspace(0.0, 1.0, length, dtype=np.float32)
    fade_in = np.sin(x * math.pi * 0.5)
    fade_out = np.cos(x * math.pi * 0.5)
    return fade_out[:, None], fade_in[:, None]


def ensure_len(audio: np.ndarray, samples: int) -> np.ndarray:
    if len(audio) >= samples:
        return audio[:samples]
    pad = np.zeros((samples - len(audio), audio.shape[1]), dtype=audio.dtype)
    return np.vstack([audio, pad])


def mix_section(
    base: np.ndarray,
    replacement: np.ndarray,
    sample_rate: int,
    replace_start: float,
    replace_end: float,
    replacement_start: float,
    crossfade: float,
    end_at_replace_end: bool,
) -> np.ndarray:
    start_s = seconds_to_samples(replace_start, sample_rate)
    end_s = seconds_to_samples(replace_end, sample_rate)
    repl_start_s = seconds_to_samples(replacement_start, sample_rate)
    section_len = max(1, end_s - start_s)
    fade_len = min(seconds_to_samples(crossfade, sample_rate), section_len // 2, max(0, len(base) - start_s))

    replacement_section = ensure_len(replacement[repl_start_s:], section_len)
    output_len = end_s if end_at_replace_end else max(len(base), end_s)
    output = np.zeros((output_len, 2), dtype=np.float32)

    base_copy_len = min(len(base), output_len)
    output[:base_copy_len] = base[:base_copy_len]

    if fade_len > 0:
        fade_out, fade_in = equal_power_fade(fade_len)
        output[start_s:start_s + fade_len] = (
            output[start_s:start_s + fade_len] * fade_out
            + replacement_section[:fade_len] * fade_in
        )
        output[start_s + fade_len:end_s] = replacement_section[fade_len:section_len]
    else:
        output[start_s:end_s] = replacement_section

    if not end_at_replace_end and end_s < len(base):
        tail_fade = min(fade_len, output_len - end_s, len(base) - end_s)
        if tail_fade > 0:
            fade_out, fade_in = equal_power_fade(tail_fade)
            repl_tail = output[end_s:end_s + tail_fade].copy()
            base_tail = base[end_s:end_s + tail_fade]
            output[end_s:end_s + tail_fade] = repl_tail * fade_out + base_tail * fade_in
    return output


def normalize_peak(audio: np.ndarray, peak: float) -> np.ndarray:
    current = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if current <= 0.0:
        return audio
    return audio * min(peak / current, 1.0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a beat-aware replacement music section.")
    parser.add_argument("--base", required=True, type=Path, help="Original audio or video file.")
    parser.add_argument("--replacement", required=True, type=Path, help="New audio or video file to source the replacement section from.")
    parser.add_argument("--output", required=True, type=Path, help="Output audio path (.wav, .mp3, .m4a).")
    parser.add_argument("--replace-start", required=True, type=parse_time, help="Timeline time where replacement begins, e.g. 17.8.")
    parser.add_argument("--replace-end", required=True, type=parse_time, help="Timeline time where replacement ends, e.g. 27.63.")
    parser.add_argument("--replacement-start", default="auto", help="Source start time in replacement, or 'auto' to align a strong hit to replace-end.")
    parser.add_argument("--hit-search-start", type=parse_time, default=0.0, help="Start of replacement search window for the ending hit.")
    parser.add_argument("--hit-search-end", type=parse_time, default=None, help="End of replacement search window for the ending hit.")
    parser.add_argument("--crossfade", type=float, default=0.18, help="Crossfade duration in seconds at the cut.")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Working sample rate.")
    parser.add_argument("--end-at-replace-end", action="store_true", help="Trim output at replace-end instead of keeping the original tail.")
    parser.add_argument("--report", type=Path, help="Optional JSON report path.")
    parser.add_argument("--peak", type=float, default=0.98, help="Output peak ceiling.")
    args = parser.parse_args()

    global librosa, np, sf
    try:
        import librosa
        import numpy as np
        import soundfile as sf
    except Exception as err:
        raise RuntimeError(
            "Missing audio analysis dependency. Install Motion-Agent-Analysis-Tools "
            "or run installers/analysis-tools/install.command first. "
            f"Original error: {err}"
        ) from err

    if args.replace_end <= args.replace_start:
        raise SystemExit("--replace-end must be greater than --replace-start")

    base = load_audio(args.base, args.sample_rate)
    replacement = load_audio(args.replacement, args.sample_rate)
    section_len = args.replace_end - args.replace_start
    replacement_duration = len(replacement) / float(args.sample_rate)

    selected_hit = None
    if str(args.replacement_start).strip().lower() == "auto":
        search_end = args.hit_search_end if args.hit_search_end is not None else replacement_duration
        selected_hit = find_strong_hit(replacement, args.sample_rate, args.hit_search_start, search_end)
        if selected_hit is None:
            replacement_start = 0.0
        else:
            replacement_start = max(0.0, selected_hit - section_len)
    else:
        replacement_start = parse_time(args.replacement_start)

    max_start = max(0.0, replacement_duration - section_len)
    replacement_start = min(max(0.0, replacement_start), max_start)

    mixed = mix_section(
        base=base,
        replacement=replacement,
        sample_rate=args.sample_rate,
        replace_start=args.replace_start,
        replace_end=args.replace_end,
        replacement_start=replacement_start,
        crossfade=args.crossfade,
        end_at_replace_end=args.end_at_replace_end,
    )
    mixed = normalize_peak(mixed, args.peak)
    write_audio(args.output, mixed, args.sample_rate)

    report = {
        "ok": True,
        "base": str(args.base),
        "replacement": str(args.replacement),
        "output": str(args.output),
        "replace_start": args.replace_start,
        "replace_end": args.replace_end,
        "section_duration": section_len,
        "replacement_start": replacement_start,
        "replacement_hit_used": selected_hit,
        "crossfade": args.crossfade,
        "end_at_replace_end": args.end_at_replace_end,
        "base_bpm_estimate": estimate_bpm(base, args.sample_rate),
        "replacement_bpm_estimate": estimate_bpm(replacement, args.sample_rate),
        "output_duration": samples_to_seconds(len(mixed), args.sample_rate),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as err:
        print(f"audio_transition_fit failed: {err}", file=sys.stderr)
        raise SystemExit(1)

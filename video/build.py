"""Assembles the Mandate demo video from the filmed scenes and the narration.

  python video/build.py            (any Python 3; needs ffmpeg and ffprobe on the PATH)

For each scene: the WebM from video/record.ts, the WAV from video/voice.py, captions from
video/narration.json. A scene lasts as long as its longer track: a shorter video holds its last frame, a
shorter narration is followed by silence. Waiting on a model is sped up (at most 2.5x) when a scene
runs far longer than its narration. Output: video/out/mandate-demo.mp4 (1280x720, H.264, AAC).
"""
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
RAW = OUT / "raw"
VOICE = OUT / "voice"
PARTS = OUT / "parts"
ORDER = ["intro", "create", "agent", "blocked", "history", "merchant", "dispute", "closing"]
LEAD = 0.4  # seconds before the narration starts
TAIL = 0.8  # seconds after the narration ends
MAX_SPEED = 2.5
LIMIT = 165.0  # 2:45, the submission's own limit


def probe(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def captions(text: str, start: float, length: float) -> list[tuple[float, float, str]]:
    """Splits the narration into short lines timed by their share of characters."""
    sentences = [s.strip() for s in re.split(r"(?<=[.:])\s+", text) if s.strip()]
    lines: list[str] = []
    for s in sentences:
        words, cur = s.split(), ""
        for w in words:
            if len(cur) + len(w) + 1 > 62 and cur:
                lines.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}".strip()
        if cur:
            lines.append(cur)
    total = sum(len(line) for line in lines)
    out, t = [], start
    for line in lines:
        d = length * len(line) / total
        out.append((t, t + d, line))
        t += d
    return out


def main() -> None:
    PARTS.mkdir(parents=True, exist_ok=True)
    narration = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    subs: list[tuple[float, float, str]] = []
    clock = 0.0
    parts = []
    for name in ORDER:
        video, audio = RAW / f"{name}.webm", VOICE / f"{name}.wav"
        v, a = probe(video), probe(audio)
        speech = LEAD + a + TAIL
        speed = 1.0
        if v > speech + 6:
            speed = min(MAX_SPEED, v / (speech + 2))
        shown = v / speed
        length = max(shown, speech)
        hold = max(0.0, length - shown)
        part = PARTS / f"{name}.mp4"
        vf = f"setpts=PTS/{speed:.4f},fps=30,scale=1280:720,tpad=stop_mode=clone:stop_duration={hold:.3f}"
        af = f"adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,atrim=0:{length:.3f}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(audio), "-filter:v", vf, "-filter:a", af,
                        "-t", f"{length:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", str(part)], check=True)
        subs += captions(narration[name], clock + LEAD, a)
        print(f"{name}: video {v:.1f}s x{speed:.2f}, narration {a:.1f}s, part {length:.1f}s")
        clock += length
        parts.append(part)

    srt = OUT / "captions.srt"
    srt.write_text("\n".join(f"{i}\n{srt_time(s)} --> {srt_time(e)}\n{t}\n" for i, (s, e, t) in enumerate(subs, 1)), encoding="utf-8")
    lst = OUT / "parts.txt"
    lst.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in parts), encoding="utf-8")
    joined = OUT / "joined.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)], check=True)
    # Opaque box in the interface's ink colour (#121518; ASS colours are &HAABBGGRR, alpha 00 = opaque).
    style = "FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,BackColour=&H00181512,BorderStyle=4,Outline=6,Shadow=0,MarginV=24"
    final = OUT / "mandate-demo.mp4"
    # The subtitles filter needs a path relative to the working directory (Windows drive letters break it).
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "joined.mp4", "-vf", f"subtitles=captions.srt:force_style='{style}'",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy", "mandate-demo.mp4"],
                   check=True, cwd=OUT)
    total = probe(final)
    print(f"total {total:.1f}s ({int(total // 60)}:{total % 60:04.1f})", "OK" if total <= LIMIT else "OVER THE 2:45 LIMIT")


if __name__ == "__main__":
    main()

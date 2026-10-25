"""Narration for the Mandate demo: one WAV per scene with the local Piper voice en_US-ryan-high.

Run with the Beneficia project's Python (which has piper installed):
  D:/claude/beneficia/.venv/Scripts/python.exe video/voice.py
Writes video/out/voice/<scene>.wav and durations.json (seconds per scene).
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
VOICE = Path("D:/claude/beneficia/video/piper/en_US-ryan-high.onnx")
OUT = HERE / "out" / "voice"


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
                         capture_output=True, text=True).stdout
    return round(float(out.strip()), 2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    durations = {}
    for name, text in scenes.items():
        path = OUT / f"{name}.wav"
        subprocess.run([sys.executable, "-m", "piper", "-m", str(VOICE), "--length-scale", "1.04", "--sentence-silence", "0.3",
                        "-f", str(path)], input=text.encode("utf-8"), check=True, capture_output=True)
        durations[name] = duration(path)
    (OUT / "durations.json").write_text(json.dumps(durations, indent=1), encoding="utf-8")
    print(durations, "total", round(sum(durations.values()), 1))


if __name__ == "__main__":
    main()

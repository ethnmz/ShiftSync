"""Manual check: python -m app.stt path/to/recording.webm"""

import sys

from . import STTError, transcribe


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m app.stt <audio file>", file=sys.stderr)
        return 2
    try:
        result = transcribe(argv[0])
    except STTError as exc:
        print(f"couldn't transcribe: {exc}", file=sys.stderr)
        return 1
    print(f"[{result.provider}] {result.text}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

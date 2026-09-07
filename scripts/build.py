#!/usr/bin/env python3
"""Build YaleDoc distribution files from source/app.html.

Usage:
  python3 build.py              # write dist/YaleDoc-Blank.ydoc.html
  python3 build.py --check      # validate source only, write nothing

The blank file is the source template verbatim: a fresh .ydoc.html whose
payload region is `null`, so the first open always asks for a password.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "app.html"
DIST = ROOT / "dist"
OUT = DIST / "YaleDoc-Blank.ydoc.html"


def validate(src: str) -> str:
    assert "<!--YD:START-->" in src and "<!--YD:END-->" in src, "marker region missing"
    m = re.search(
        r'<script[^>]*\bid=["\']ydPayload["\'][^>]*>(.*?)</script>', src, re.S
    )
    assert m, "no <script id=ydPayload> element found"
    if "<!--YD:START-->null<!--YD:END-->" not in m.group(1):
        raise SystemExit(
            "ERROR: source template payload is not null (blank). "
            "Ship blank files with an encrypted payload only if you know "
            "who holds the password."
        )
    return m.group(1)


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    validate(src)

    if "--check" in sys.argv:
        print("OK: source template validated (blank payload).")
        return 0

    DIST.mkdir(exist_ok=True)
    OUT.write_text(src, encoding="utf-8")
    print(f"Built {OUT} ({OUT.stat().st_size:,} bytes)")
    print("Opens to the setup screen: first run always asks for a password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
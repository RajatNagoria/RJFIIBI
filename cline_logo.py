#!/usr/bin/env python3
"""Print the Cline logo as ASCII art built from the "@" character.

The artwork has two parts:

  * a badge -- a rounded square with a "C" cut out of it, the way the real
    Cline mark reads as a light glyph on a solid tile;
  * a wordmark -- the word "CLINE" in a 5-row block font.

Every pixel of the artwork is either an "@" or a space, so the output stays
readable in any terminal and can be piped into a plain text file.

Usage:
    python3 cline_logo.py                  # badge + wordmark, coloured
    python3 cline_logo.py --plain          # no ANSI colour codes
    python3 cline_logo.py --only badge     # just the badge
    python3 cline_logo.py --only wordmark  # just the wordmark
    python3 cline_logo.py --fill '#'       # draw with a different character
"""

from __future__ import annotations

import argparse
import sys

# ---------------------------------------------------------------------------
# The badge: an 11x11 rounded square, solid, with a "C" carved out of it.
# ---------------------------------------------------------------------------
BADGE = r"""
 @@@@@@@@@
@@@@@@@@@@@
@@@@    @@@
@@@  @@@@@@
@@@  @@@@@@
@@@  @@@@@@
@@@  @@@@@@
@@@  @@@@@@
@@@@    @@@
@@@@@@@@@@@
 @@@@@@@@@
"""

# ---------------------------------------------------------------------------
# The wordmark: "CLINE" in a 5-row block font, one space between letters.
# ---------------------------------------------------------------------------
WORDMARK_LETTERS = {
    "C": (
        " @@@@",
        "@    ",
        "@    ",
        "@    ",
        " @@@@",
    ),
    "L": (
        "@    ",
        "@    ",
        "@    ",
        "@    ",
        "@@@@@",
    ),
    "I": (
        "@@@@@",
        "  @  ",
        "  @  ",
        "  @  ",
        "@@@@@",
    ),
    "N": (
        "@   @",
        "@@  @",
        "@ @ @",
        "@  @@",
        "@   @",
    ),
    "E": (
        "@@@@@",
        "@    ",
        "@@@@ ",
        "@    ",
        "@@@@@",
    ),
}

WORD = "CLINE"
LETTER_GAP = " "
ROW_COUNT = 5


def build_wordmark(word: str = WORD) -> list[str]:
    """Return the block-font rendering of *word* as a list of rows."""
    glyphs = []
    for char in word.upper():
        if char not in WORDMARK_LETTERS:
            raise ValueError(f"no block glyph for {char!r}")
        glyphs.append(WORDMARK_LETTERS[char])

    return [
        LETTER_GAP.join(glyph[row] for glyph in glyphs).rstrip()
        for row in range(ROW_COUNT)
    ]


def badge_lines() -> list[str]:
    """Return the badge artwork with blank leading/trailing lines removed."""
    return [line.rstrip() for line in BADGE.strip("\n").splitlines()]


def _pad_block(lines: list[str], width: int) -> list[str]:
    """Centre a whole block by prefixing every line with the same padding.

    Padding each line on its own would shear the artwork, so the offset is
    computed once from the widest line and then applied uniformly.
    """
    widest = max(len(line) for line in lines)
    prefix = " " * max(0, (width - widest) // 2)
    return [prefix + line for line in lines]


def _colourise(text: str, fill: str) -> str:
    """Wrap the artwork in ANSI colour codes, if the terminal wants them."""
    if not sys.stdout.isatty():
        return text
    blue = "\033[38;5;39m"  # Cline blue
    reset = "\033[0m"
    return "\n".join(
        f"{blue}{line}{reset}" if fill in line else line
        for line in text.splitlines()
    )


def render(fill: str = "@", colour: bool = False, only: str = "all") -> str:
    """Build the requested logo as a single string ending in a newline."""
    if len(fill) != 1:
        raise ValueError("fill must be exactly one character")

    blocks: list[list[str]] = []
    if only in ("all", "badge"):
        blocks.append(badge_lines())
    if only in ("all", "wordmark"):
        blocks.append(build_wordmark())

    # Swap the drawing character, then centre each block as a whole so the
    # badge sits directly above the middle of the wordmark.
    prepared = [[line.replace("@", fill) for line in block] for block in blocks]
    width = max(len(line) for block in prepared for line in block)
    prepared = [_pad_block(block, width) for block in prepared]

    body = "\n".join(line for block in prepared for line in block + [""])
    body = body.rstrip("\n")

    if colour:
        body = _colourise(body, fill)

    return body + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Print the Cline logo using @ characters."
    )
    parser.add_argument(
        "--fill",
        default="@",
        help="character used to draw the logo (default: @)",
    )
    parser.add_argument(
        "--only",
        choices=("all", "badge", "wordmark"),
        default="all",
        help="print only part of the logo (default: all)",
    )
    parser.add_argument(
        "--plain",
        action="store_true",
        help="never emit ANSI colour codes",
    )
    parser.add_argument(
        "--no-colour",
        "--no-color",
        dest="plain",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)

    try:
        sys.stdout.write(render(fill=args.fill, colour=not args.plain, only=args.only))
    except ValueError as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

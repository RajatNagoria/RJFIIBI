# RJFIIBI
For testing purpose

## Cline logo printer

`cline_logo.py` prints the Cline logo as ASCII art made entirely of `@`
characters and spaces, so it renders the same in any terminal and can be
redirected straight into a text file.

```
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

 @@@@ @     @@@@@ @   @ @@@@@
@     @       @   @@  @ @
@     @       @   @ @ @ @@@@
@     @       @   @  @@ @
 @@@@ @@@@@ @@@@@ @   @ @@@@@
```

The artwork has two parts:

* **the badge** -- a rounded square with a `C` carved out of it, the way the
  real Cline mark reads as a light glyph on a solid tile;
* **the wordmark** -- the word `CLINE` in a 5-row block font, centred under
  the badge.

### Usage

No dependencies beyond Python 3.8+.

```sh
python3 cline_logo.py                   # badge + wordmark, coloured on a TTY
python3 cline_logo.py --plain           # never emit ANSI colour codes
python3 cline_logo.py --only badge      # just the badge
python3 cline_logo.py --only wordmark   # just the wordmark
python3 cline_logo.py --fill '#'        # draw with a different character
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--fill CHAR` | `@` | Character used to draw the logo. |
| `--only {all,badge,wordmark}` | `all` | Print only part of the logo. |
| `--plain` | off | Disable ANSI colour (also `--no-colour` / `--no-color`). |

Colour is emitted only when stdout is a TTY, so piping or redirecting the
output always yields clean, escape-free text.

### Tests

```sh
python3 -m unittest -v
```

The suite covers the block font, the badge shape, block alignment, the
`@`-only invariant of the default output, and CLI input validation.

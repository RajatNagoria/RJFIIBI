#!/usr/bin/env python3
"""Tests for cline_logo.py -- run with: python3 -m unittest -v"""

import unittest

from cline_logo import (
    ROW_COUNT,
    WORD,
    badge_lines,
    build_wordmark,
    render,
)


class TestWordmark(unittest.TestCase):
    def test_cline_has_five_rows(self):
        self.assertEqual(len(build_wordmark()), ROW_COUNT)

    def test_every_letter_has_the_same_height(self):
        for char in WORD:
            self.assertEqual(len(build_wordmark(char)), ROW_COUNT, char)

    def test_lowercase_is_accepted(self):
        self.assertEqual(build_wordmark("cline"), build_wordmark(WORD))

    def test_unknown_letter_is_rejected(self):
        with self.assertRaises(ValueError):
            build_wordmark("Z")

    def test_letters_are_separated_by_a_space(self):
        # The C and the L are one space apart on every row.
        for row in build_wordmark("CL"):
            self.assertEqual(row[5], " ")


class TestBadge(unittest.TestCase):
    def test_badge_is_eleven_rows(self):
        self.assertEqual(len(badge_lines()), 11)

    def test_corners_are_rounded(self):
        lines = badge_lines()
        self.assertTrue(lines[0].startswith(" "))
        self.assertTrue(lines[0].endswith("@"))
        self.assertTrue(lines[-1].startswith(" "))

    def test_letter_c_is_carved_out(self):
        # Row 2 of the badge has a run of spaces forming the top of the C.
        self.assertIn("    ", badge_lines()[2])


class TestRender(unittest.TestCase):
    def test_default_output_uses_only_at_and_spaces(self):
        self.assertLessEqual(set(render()), {"@", "\n", " "})

    def test_output_ends_with_a_single_newline(self):
        out = render()
        self.assertTrue(out.endswith("\n"))
        self.assertFalse(out.endswith("\n\n"))

    def test_fill_character_replaces_the_at_sign(self):
        out = render(fill="#")
        self.assertIn("#", out)
        self.assertNotIn("@", out)

    def test_fill_must_be_one_character(self):
        for bad in ("", "ab"):
            with self.assertRaises(ValueError):
                render(fill=bad)

    def test_badge_sits_above_the_wordmark(self):
        lines = render(only="all").splitlines()
        # 11 badge rows + 1 blank separator row, then the wordmark.
        self.assertEqual(len(lines), 11 + 1 + ROW_COUNT)
        self.assertEqual(lines[11], "")

    @staticmethod
    def _centre_of(lines):
        """Return the mid-point column of a block of artwork."""
        starts = [len(line) - len(line.lstrip()) for line in lines]
        ends = [len(line.rstrip()) for line in lines]
        return (min(starts) + max(ends)) / 2

    def test_badge_is_centred_over_the_wordmark(self):
        lines = render(only="all").splitlines()
        badge, wordmark = lines[:11], lines[12:]
        self.assertLessEqual(
            abs(self._centre_of(badge) - self._centre_of(wordmark)), 1.0
        )

    def test_badge_is_narrower_than_the_wordmark(self):
        lines = render(only="all").splitlines()
        badge, wordmark = lines[:11], lines[12:]
        self.assertLess(max(map(len, badge)), max(map(len, wordmark)))

    def test_only_badge_has_no_wordmark(self):
        out = render(only="badge")
        self.assertEqual(len(out.splitlines()), 11)

    def test_only_wordmark_has_no_badge(self):
        out = render(only="wordmark")
        self.assertEqual(len(out.splitlines()), ROW_COUNT)
        self.assertNotIn("@@@@@@@@@@@", out)

    def test_plain_output_has_no_escape_codes(self):
        self.assertNotIn("\033", render(colour=False))


if __name__ == "__main__":
    unittest.main(verbosity=2)

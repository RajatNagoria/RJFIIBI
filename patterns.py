"""Print 3 different star patterns."""


def right_triangle(n):
    """Pattern 1: Right-angled triangle."""
    print("Pattern 1: Right-Angled Triangle")
    for i in range(1, n + 1):
        print("* " * i)


def pyramid(n):
    """Pattern 2: Pyramid."""
    print("Pattern 2: Pyramid")
    for i in range(1, n + 1):
        print(" " * (n - i) + "* " * i)


def diamond(n):
    """Pattern 3: Diamond."""
    print("Pattern 3: Diamond")
    for i in range(1, n + 1):
        print(" " * (n - i) + "* " * i)
    for i in range(n - 1, 0, -1):
        print(" " * (n - i) + "* " * i)


if __name__ == "__main__":
    rows = 5
    right_triangle(rows)
    print()
    pyramid(rows)
    print()
    diamond(rows)

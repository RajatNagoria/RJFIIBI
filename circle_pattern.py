"""
Program to print a @@@@ pattern in the shape of a circle.

Includes both a filled circle and a hollow (outline) circle option.
"""


def print_circle(radius):
    """Print a filled circle using '@@' characters."""
    for y in range(-radius, radius + 1):
        row = ""
        for x in range(-radius, radius + 1):
            # x is scaled by 0.5 to compensate for character width/height
            # so the printed circle looks round instead of oval.
            if (x * 0.5) ** 2 + y ** 2 <= radius ** 2:
                row += "@@"
            else:
                row += "  "
        print(row)


def print_circle_outline(radius, thickness=1):
    """Print only the outline (ring) of a circle using '@@' characters."""
    for y in range(-radius, radius + 1):
        row = ""
        for x in range(-radius, radius + 1):
            dist = (x * 0.5) ** 2 + y ** 2
            if radius ** 2 - thickness * radius <= dist <= radius ** 2:
                row += "@@"
            else:
                row += "  "
        print(row)


if __name__ == "__main__":
    try:
        r = int(input("Enter radius: "))
    except ValueError:
        r = 10
        print(f"Invalid input, using default radius = {r}")

    choice = input("Filled (f) or Outline (o)? [f]: ").strip().lower()

    if choice == "o":
        print_circle_outline(r)
    else:
        print_circle(r)

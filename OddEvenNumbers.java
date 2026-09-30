/**
 * Prints:
 *   1. Odd numbers from 50 to 100 in ascending order   (51, 53, ... , 99)
 *   2. Even numbers from 100 to 50 in descending order (100, 98, ... , 50)
 *   3. Odd numbers from 100 to 125 in descending order (125, 123, ... , 101)
 *   4. All numbers from 125 to 100 in descending order (125, 124, ... , 100)
 *
 * Note: all range bounds are treated as inclusive. Because 50 and 100 are
 * even they never appear in an odd-number list; 125 is odd, so it is the
 * first value of the third list.
 */
public class OddEvenNumbers {

    /** Lower bound of the first range (inclusive). */
    private static final int LOWER_BOUND = 50;

    /** Upper bound of the first range / lower bound of the second range (inclusive). */
    private static final int UPPER_BOUND = 100;

    /** Upper bound of the second range (inclusive). */
    private static final int EXTENDED_UPPER_BOUND = 125;

    public static void main(String[] args) {
        printOddAscending(LOWER_BOUND, UPPER_BOUND);
        System.out.println();
        printEvenDescending(UPPER_BOUND, LOWER_BOUND);
        System.out.println();
        printOddDescending(EXTENDED_UPPER_BOUND, UPPER_BOUND);
        System.out.println();
        printAllDescending(EXTENDED_UPPER_BOUND, UPPER_BOUND);
    }

    /**
     * Prints every odd number from {@code from} up to {@code to} (both inclusive)
     * in ascending order.
     *
     * @param from the lower bound of the range (inclusive)
     * @param to   the upper bound of the range (inclusive)
     */
    private static void printOddAscending(int from, int to) {
        System.out.println("Odd numbers between " + from + " and " + to + " (ascending):");

        // Move the start to the first odd value so the loop can simply step by 2.
        int start = (from % 2 == 0) ? from + 1 : from;

        StringBuilder result = new StringBuilder();
        for (int number = start; number <= to; number += 2) {
            if (result.length() > 0) {
                result.append(", ");
            }
            result.append(number);
        }
        System.out.println(result);
    }

    /**
     * Prints every even number from {@code from} down to {@code to} (both inclusive)
     * in descending order.
     *
     * @param from the upper bound of the range (inclusive)
     * @param to   the lower bound of the range (inclusive)
     */
    private static void printEvenDescending(int from, int to) {
        System.out.println("Even numbers between " + from + " and " + to + " (descending):");

        // Move the start to the first even value so the loop can simply step by 2.
        int start = (from % 2 == 0) ? from : from - 1;

        StringBuilder result = new StringBuilder();
        for (int number = start; number >= to; number -= 2) {
            if (result.length() > 0) {
                result.append(", ");
            }
            result.append(number);
        }
        System.out.println(result);
    }

    /**
     * Prints every odd number from {@code from} down to {@code to} (both inclusive)
     * in descending order.
     *
     * @param from the upper bound of the range (inclusive)
     * @param to   the lower bound of the range (inclusive)
     */
    private static void printOddDescending(int from, int to) {
        System.out.println("Odd numbers between " + from + " and " + to + " (descending):");

        // Move the start to the first odd value so the loop can simply step by 2.
        int start = (from % 2 == 0) ? from - 1 : from;

        StringBuilder result = new StringBuilder();
        for (int number = start; number >= to; number -= 2) {
            if (result.length() > 0) {
                result.append(", ");
            }
            result.append(number);
        }
        System.out.println(result);
    }

    /**
     * Prints every number (both odd and even) from {@code from} down to
     * {@code to} (both inclusive) in descending order.
     *
     * @param from the upper bound of the range (inclusive)
     * @param to   the lower bound of the range (inclusive)
     */
    private static void printAllDescending(int from, int to) {
        System.out.println("All numbers between " + from + " and " + to + " (descending):");

        StringBuilder result = new StringBuilder();
        for (int number = from; number >= to; number--) {
            if (result.length() > 0) {
                result.append(", ");
            }
            result.append(number);
        }
        System.out.println(result);
    }
}

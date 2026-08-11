const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*-_=+";
const ALL_CHARS = UPPER + LOWER + DIGIT + SYMBOL;

/** Crypto-strong password: ≥16 chars with upper, lower, digit, and symbol. */
export function generatePolicyPassword(length = 16): string {
  const size = Math.max(16, length);
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  const chars: string[] = [
    UPPER[bytes[0]! % UPPER.length]!,
    LOWER[bytes[1]! % LOWER.length]!,
    DIGIT[bytes[2]! % DIGIT.length]!,
    SYMBOL[bytes[3]! % SYMBOL.length]!,
  ];
  for (let i = 4; i < size; i += 1) {
    chars.push(ALL_CHARS[bytes[i]! % ALL_CHARS.length]!);
  }
  const shuffle = new Uint8Array(size);
  crypto.getRandomValues(shuffle);
  for (let i = size - 1; i > 0; i -= 1) {
    const j = shuffle[i]! % (i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}

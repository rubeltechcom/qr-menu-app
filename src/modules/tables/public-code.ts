import { randomInt } from "node:crypto";

/**
 * The code that goes in a table's QR URL (/t/<publicCode>).
 *
 * Two properties matter, and they pull in opposite directions:
 *
 *   1. It must be UNGUESSABLE. If a diner at table 4 can guess table 5's
 *      code, they can send orders to a stranger's bill. Sequential IDs
 *      are therefore out, which is why the schema keeps `publicCode`
 *      separate from the human `label` staff use.
 *
 *   2. It must be SHORT, because it is printed on a small sticker and
 *      re-typed by hand when a QR sticker gets scratched.
 *
 * 8 characters from a 31-symbol alphabet gives ~40 bits (about 8.5x10^11
 * codes). At even a million tables in the platform, a blind guess hits an
 * existing code roughly once in a million attempts — and rate limiting on
 * the storefront covers the rest.
 *
 * The alphabet excludes 0/O, 1/I/L and U: the first two because they are
 * misread when a code is typed in from a scratched sticker, and U because
 * excluding it keeps accidental English profanity out of printed codes.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

export function generatePublicCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // randomInt() is the CSPRNG — Math.random() is predictable from
    // observed output and must never generate anything addressable.
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

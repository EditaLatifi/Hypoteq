/**
 * Bot check for the public contact and partner forms.
 *
 * Since 18.11.2026 a headless browser opens the contact and partner pages, fills every field
 * with random letters ("cqKjjZLNdXfGOdsCF") and sends within about 1.5 seconds. Each hit mailed
 * info@ and sent our auto-reply to a stranger's address. A submission counts as a bot when:
 *  - the hidden field (HONEYPOT_FIELD) has a value: people never see it, form-filling bots do;
 *  - the form says it was open for less than MIN_FILL_MS (no person fills it that fast);
 *  - a field holds a random-letter word.
 * Submissions without the timing (a tab opened before this check went live) are judged by the
 * other two rules only.
 */

export const HONEYPOT_FIELD = "hq_extra";
export const MIN_FILL_MS = 4000;

export type SpamVerdict = { spam: false } | { spam: true; reason: string };

/** A word of random letters: 10+ ASCII letters whose case flips back and forth. Real names,
 *  brands and German compounds flip a few times at most ("McDonaldsAG": 4). */
export function isRandomWord(word: string): boolean {
  if (!/^[A-Za-z]{10,}$/.test(word)) return false;
  let flips = 0;
  for (let i = 1; i < word.length; i++) {
    const prevUpper = word[i - 1] >= "A" && word[i - 1] <= "Z";
    const upper = word[i] >= "A" && word[i] <= "Z";
    if (prevUpper !== upper) flips++;
  }
  const innerCapitals = (word.slice(1).match(/[A-Z]/g) || []).length;
  return flips >= 6 && innerCapitals >= 4;
}

function hasRandomWord(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Links can carry random-looking ids (maps.app.goo.gl/XyZaBcDeFgH); the bot sends none.
  const text = value.replace(/(?:https?:\/\/|www\.)\S+/gi, " ");
  return text.split(/[\s.,;:!?()"'/\\-]+/).some(isRandomWord);
}

export function checkFormSpam(
  body: Record<string, unknown>,
  textFields: string[]
): SpamVerdict {
  const trap = body[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") {
    return { spam: true, reason: "hidden field filled" };
  }

  const elapsed = body.elapsedMs;
  if (typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed < MIN_FILL_MS) {
    return { spam: true, reason: `sent ${Math.round(elapsed)} ms after the form opened` };
  }

  const random = textFields.find((f) => hasRandomWord(body[f]));
  if (random) {
    return { spam: true, reason: `random letters in ${random}` };
  }

  return { spam: false };
}

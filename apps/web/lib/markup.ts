/** Checks a typed markup such as "1.15". Used by the product form and the Settings screen. */
export function checkMarkup(
  text: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Enter a markup, for example 1.10.' };
  if (!/^\d+(\.\d{1,4})?$/.test(t)) {
    return { ok: false, error: 'Enter a number such as 1.15 (up to 4 decimals).' };
  }
  const n = Number(t);
  if (n < 1) {
    return {
      ok: false,
      error: 'Enter 1.00 or more, so the website is never cheaper than the shop.',
    };
  }
  if (n > 10) {
    return {
      ok: false,
      error: 'Enter 10 or less. A markup of 10 means ten times the wholesale price.',
    };
  }
  return { ok: true, value: n };
}

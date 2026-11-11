/** Digits only, for a wa.me link: "+263 77 123 4567" becomes "263771234567". */
export function whatsappLink(number: string): string | null {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 7) return null;
  // A local 07... number is Zimbabwean: swap the leading 0 for 263.
  const international = digits.startsWith('0') ? `263${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

/** Splits plain text on blank lines, so staff can write paragraphs without markup. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

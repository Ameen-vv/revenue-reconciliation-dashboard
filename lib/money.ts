/**
 * Money is integer cents everywhere in this system.
 *
 * The CSVs carry decimal strings like "325.12" and "0.0". Running those
 * through parseFloat and multiplying by 100 is how reconciliation tools
 * acquire phantom one-cent discrepancies: 1.005 * 100 is 100.49999999999999.
 * So we convert from the string itself and never let a float touch a value we
 * later compare for equality.
 */

/**
 * Parses a decimal money string into integer cents.
 *
 * Returns null for blank/absent input so that a missing field stays
 * distinguishable from a genuine zero -- ORD-2201 has an empty discount, which
 * is a data-quality signal, not a 0.00 discount someone chose to apply.
 */
export function toCents(value: string | null | undefined): number | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) return null;

  const [, sign, whole = "", frac = ""] = match;
  if (whole === "" && frac === "") return null;

  // Pad or truncate to exactly two decimal places. Truncation past the second
  // decimal is intentional: these exports are already in cents, so a third
  // digit would mean the file is not what it claims to be.
  const cents = (frac + "00").slice(0, 2);
  const magnitude = Number(whole || "0") * 100 + Number(cents);

  return sign === "-" ? -magnitude : magnitude;
}

/**
 * Formats integer cents for display, e.g. 3251200 -> "32,512.00".
 *
 * Input is rounded first: chart libraries hand back fractional tick values
 * derived from the domain, and formatting those digit-by-digit produces
 * nonsense like "490.43.75".
 */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const body = `${whole}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Formats integer cents with a currency code, e.g. "USD 325.12". */
export function formatMoney(cents: number, currency = "USD"): string {
  return `${currency} ${formatCents(cents)}`;
}

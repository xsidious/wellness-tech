/**
 * Practice sell price = VitaRelay practice wholesale × this multiplier.
 * 1.2 = 20% markup for clinic partners ordering through Wellness Tech.
 */
export const WT_FORMULARY_MARKUP = 1.2;

function moneyCents(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Formulary rows use dollars (API price_cents / 100, or local JSON dollars).
  return Math.round(n * 100);
}

/** Wellness Tech catalog / public practice price (cents) after margin. */
export function partnerPriceCentsFromFormulary(wholesale: unknown) {
  return Math.round(moneyCents(wholesale) * WT_FORMULARY_MARKUP);
}

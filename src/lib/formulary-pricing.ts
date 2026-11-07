/** Practice retail = formulary list price × this multiplier. */
export const WT_FORMULARY_MARKUP = 2;

function moneyCents(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Wellness Tech catalog / public practice price (cents) after margin. */
export function partnerPriceCentsFromFormulary(wholesale: unknown) {
  return moneyCents(wholesale) * WT_FORMULARY_MARKUP;
}

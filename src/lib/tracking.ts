/** Best-effort carrier deep link from a tracking number. */
export function trackingHref(trackingNumber: string | null | undefined): string | null {
  const t = (trackingNumber || "").trim();
  if (!t) return null;
  if (/^1Z[0-9A-Z]+$/i.test(t)) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
  }
  if (/^\d{12,22}$/.test(t)) {
    if (t.length === 22 || t.startsWith("94") || t.startsWith("93")) {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
    }
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`tracking ${t}`)}`;
}

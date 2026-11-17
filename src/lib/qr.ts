import QRCode from "qrcode";

/** PNG data URL for printing / sharing affiliate partner links. */
export async function qrDataUrl(text: string, size = 280) {
  const value = String(text || "").trim();
  if (!value) return "";
  return QRCode.toDataURL(value, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0F2526", light: "#ffffff" },
  });
}

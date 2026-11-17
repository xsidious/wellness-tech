type Props = {
  code: string;
  partnerLink: string;
  qrDataUrl: string;
  compact?: boolean;
};

/** Displays an affiliate referral QR + link for print / phone camera scan. */
export function AffiliateQrCard({ code, partnerLink, qrDataUrl, compact }: Props) {
  if (!qrDataUrl) return null;
  return (
    <div
      className="ws-kv"
      style={{
        display: "grid",
        gap: compact ? 10 : 16,
        gridTemplateColumns: compact ? "100px 1fr" : "minmax(160px, 200px) 1fr",
        alignItems: "center",
      }}
    >
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code for affiliate ${code}`}
          width={compact ? 100 : 200}
          height={compact ? 100 : 200}
          style={{
            display: "block",
            width: compact ? 100 : 200,
            height: compact ? 100 : 200,
            borderRadius: 8,
            border: "1px solid rgba(15,37,38,0.12)",
            background: "#fff",
          }}
        />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <span className="muted">Scan to open signup</span>
          <strong style={{ display: "block", wordBreak: "break-all" }}>{partnerLink}</strong>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a className="btn btn-ghost" href={partnerLink} target="_blank" rel="noreferrer">
            Open link
          </a>
          <a className="btn btn-accent" href={qrDataUrl} download={`wellness-tech-affiliate-${code}.png`}>
            Download QR
          </a>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Code <strong>{code}</strong> — practices that sign up with this link stay attributed forever.
        </p>
      </div>
    </div>
  );
}

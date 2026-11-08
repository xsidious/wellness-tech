import Link from "next/link";

export type AttentionItem = {
  href: string;
  label: string;
  tone?: "warn" | "info" | "ok";
};

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <aside className="ws-attention" aria-label="Needs attention">
      <p className="ws-attention-label">Needs attention</p>
      <ul className="ws-attention-list">
        {items.map((item) => (
          <li key={`${item.href}-${item.label}`}>
            <Link href={item.href} className={`ws-attention-item ws-attention-${item.tone || "info"}`}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

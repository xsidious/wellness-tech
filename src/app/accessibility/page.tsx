import { MarketingShell } from "@/components/MarketingShell";

export const metadata = {
  title: "Accessibility | Wellness Tech Distribution",
  description: "Accessibility commitment and assistance for Wellness Tech Distribution.",
};

export default function AccessibilityPage() {
  return (
    <MarketingShell>
      <main className="wrap" style={{ padding: "48px 0 72px", maxWidth: 720 }}>
        <p className="eyebrow">Accessibility</p>
        <h1>Our accessibility commitment</h1>
        <div className="stack" style={{ marginTop: 20, gap: 14, color: "var(--muted)" }}>
          <p>
            Wellness Tech Distribution is committed to a website experience that works for as many people as possible,
            including visitors who use assistive technologies. We work toward WCAG 2.1 Level AA as a practical target.
          </p>
          <p>
            Use the Accessibility tab to enlarge text, increase contrast, underline links, or reduce motion. Preferences
            stay on this device.
          </p>
          <p>
            Need help? Email{" "}
            <a href="mailto:Admin@thewellnesstech.com">Admin@thewellnesstech.com</a> or call 877-847-6423.
          </p>
          <p>
            To stop marketing emails, visit <a href="/email-preferences">Email preferences</a>. Transactional messages
            about orders or account access may still be sent when needed.
          </p>
        </div>
      </main>
    </MarketingShell>
  );
}

import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { savePracticeOnboarding } from "@/lib/practice-actions";
import {
  addPaymentMethod,
  addPracticeLocation,
  ensureClinicCode,
  saveBranding,
  saveNotificationPrefs,
  savePracticeProfile,
  saveTwilioSettings,
  sendPracticeSms,
} from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";
import { tierLabel } from "@/lib/rules";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; tab?: string; sms?: string }>;
}) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  const { saved, tab, sms } = await searchParams;
  const active = tab || "account";
  const clinicCode = await ensureClinicCode();
  const [credential, teamCount, locations, team, cards, smsMessages, org] = await Promise.all([
    prisma.prescriberCredential.findUnique({ where: { userId: user.id } }),
    prisma.user.count({ where: { orgId: user.orgId } }),
    prisma.practiceLocation.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "asc" }, take: 20 }),
    prisma.paymentMethod.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } }),
    prisma.smsMessage.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.organization.findUnique({ where: { id: user.orgId } }),
  ]);
  const branding = parseJson<Record<string, string | boolean>>(user.org.brandingJson || "{}", {});
  const prefs = parseJson<Record<string, boolean>>(user.org.notificationPrefsJson || "{}", {
    orderUpdatesInApp: true,
    orderUpdatesEmail: true,
    refillRemindersInApp: true,
    refillRemindersEmail: true,
    patientNotifyEmail: true,
    patientNotifyPortal: true,
  });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");

  const tabs = [
    { id: "account", label: "Account" },
    { id: "profile", label: "Practice Profile" },
    { id: "prescribers", label: "Prescribers" },
    { id: "billing", label: "Billing" },
    { id: "branding", label: "Branding" },
    { id: "texts", label: "Texts & calls" },
  ];

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Account"
        title="Settings"
        lede="Profile, locations, notifications, cards on file, white-label branding, and Twilio SMS."
      />
      {saved ? <p className="note">Settings saved.</p> : null}
      {sms === "sent" ? <p className="note">SMS sent via Twilio.</p> : null}
      {sms === "logged" ? <p className="note">SMS logged (Twilio not enabled — message saved to inbox).</p> : null}
      {sms === "failed" ? <p className="error">Twilio send failed — message still logged.</p> : null}

      <div className="ws-filter-row">
        {tabs.map((t) => (
          <Link key={t.id} href={`/portal/settings?tab=${t.id}`} className={`ws-filter${active === t.id ? " active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {active === "account" ? (
        <>
          <div className="ws-stat-grid">
            <div className="ws-stat">
              <span className="ws-stat-label">Onboarding</span>
              <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
                <StatusBadge tone={user.org.onboardingComplete ? "ok" : "warn"}>
                  {user.org.onboardingComplete ? "complete" : "in progress"}
                </StatusBadge>
              </strong>
            </div>
            <div className="ws-stat">
              <span className="ws-stat-label">Verification</span>
              <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
                {tierLabel(user.org.verificationTier)}
              </strong>
            </div>
            <div className="ws-stat">
              <span className="ws-stat-label">Team seats</span>
              <strong className="ws-stat-value">{teamCount}</strong>
            </div>
          </div>

          <SectionCard title="Patient signup link">
            <p style={{ wordBreak: "break-all" }}>
              <code>
                {appUrl}/signup?clinic={clinicCode}
              </code>
            </p>
            <p className="muted">Clinic code: {clinicCode}</p>
            <p className="muted">
              Security: use <Link href="/claim-account">claim account</Link> for invited users and magic codes on login.
            </p>
          </SectionCard>

          <SectionCard title="Notification preferences">
            <form action={saveNotificationPrefs} className="ws-message-form">
              {(
                [
                  ["orderUpdatesInApp", "Order updates · in-app"],
                  ["orderUpdatesEmail", "Order updates · email"],
                  ["refillRemindersInApp", "Refill reminders · in-app"],
                  ["refillRemindersEmail", "Refill reminders · email"],
                  ["patientNotifyEmail", "Patient order emails"],
                  ["patientNotifyPortal", "Patient portal alerts"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" name={key} defaultChecked={Boolean(prefs[key])} />
                  {label}
                </label>
              ))}
              <button className="btn btn-accent" type="submit">
                Save preferences
              </button>
            </form>
          </SectionCard>
        </>
      ) : null}

      {active === "profile" ? (
        <>
          <SectionCard title="Practice information">
            <form action={savePracticeProfile} className="ws-message-form">
              <div className="ws-kv">
                <label>
                  Practice name
                  <input name="legalName" defaultValue={user.org.legalName} required />
                </label>
                <label>
                  Specialty
                  <input name="specialty" defaultValue={user.org.specialty || ""} />
                </label>
                <label>
                  Phone
                  <input name="phone" defaultValue={user.org.phone || user.phone || ""} />
                </label>
                <label>
                  Website
                  <input name="website" defaultValue={user.org.website || ""} />
                </label>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="hidePricingFromStaff" defaultChecked={user.org.hidePricingFromStaff} />
                Hide pricing from staff
              </label>
              <button className="btn btn-accent" type="submit">
                Save profile
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Practice locations" description="Add every site, then mark one for office-use ship-to.">
            <ul>
              {locations.map((loc) => (
                <li key={loc.id}>
                  <b>{loc.label}</b> — {[loc.street1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ")}
                  {loc.isDefault ? " · default for orders" : ""}
                </li>
              ))}
              {!locations.length ? <li className="muted">No locations yet.</li> : null}
            </ul>
            <form action={addPracticeLocation} className="ws-message-form" style={{ marginTop: 12 }}>
              <div className="ws-kv">
                <label>
                  Label
                  <input name="label" defaultValue="Main" />
                </label>
                <label>
                  Street
                  <input name="street1" required />
                </label>
                <label>
                  City
                  <input name="city" required />
                </label>
                <label>
                  State
                  <input name="state" required />
                </label>
                <label>
                  ZIP
                  <input name="zip" required />
                </label>
                <label>
                  Phone
                  <input name="phone" />
                </label>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="isDefault" />
                Use for my office-use orders
              </label>
              <button className="btn btn-accent" type="submit">
                Add location
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Quick onboarding location" description="Legacy single-location form also marks onboarding complete.">
            <form action={savePracticeOnboarding} className="ws-message-form">
              <div className="ws-kv">
                <label>
                  Location label
                  <input name="locationLabel" defaultValue={locations[0]?.label || "Main"} />
                </label>
                <label>
                  Street
                  <input name="street1" defaultValue={locations[0]?.street1 || ""} required />
                </label>
                <label>
                  City
                  <input name="city" defaultValue={locations[0]?.city || ""} required />
                </label>
                <label>
                  State
                  <input name="state" defaultValue={locations[0]?.state || ""} required />
                </label>
                <label>
                  ZIP
                  <input name="zip" defaultValue={locations[0]?.zip || ""} required />
                </label>
                <label>
                  Phone
                  <input name="phone" defaultValue={locations[0]?.phone || user.phone || ""} />
                </label>
              </div>
              <button className="btn btn-ghost" type="submit">
                Save default location
              </button>
            </form>
          </SectionCard>
        </>
      ) : null}

      {active === "prescribers" ? (
        <SectionCard title="Prescribers on file" description="Manage invites and NPI/state licenses from Team.">
          <p>
            Your credential: {credential ? `${credential.displayName} · NPI ${credential.npi}` : "None on this login"}
          </p>
          <ul>
            {team.map((person) => (
              <li key={person.id}>
                {person.name} · {person.email} · {rolesOf(person.roles).join(", ")}
              </li>
            ))}
          </ul>
          <Link className="btn btn-accent" href="/portal/team">
            Open Team
          </Link>
        </SectionCard>
      ) : null}

      {active === "billing" ? (
        <SectionCard title="Payment methods" description="Cards saved here are available at practice checkout (display last-4 only).">
          <ul>
            {cards.map((c) => (
              <li key={c.id}>
                {c.brand} •••• {c.last4} · {c.expMonth}/{c.expYear}
                {c.isDefault ? " · default" : ""}
              </li>
            ))}
            {!cards.length ? <li className="muted">No cards on file yet.</li> : null}
          </ul>
          <form action={addPaymentMethod} className="ws-message-form" style={{ marginTop: 12 }}>
            <div className="ws-kv">
              <label>
                Brand
                <input name="brand" defaultValue="Visa" />
              </label>
              <label>
                Last 4
                <input name="last4" required maxLength={4} />
              </label>
              <label>
                Exp month
                <input name="expMonth" type="number" min={1} max={12} defaultValue={12} />
              </label>
              <label>
                Exp year
                <input name="expYear" type="number" defaultValue={new Date().getFullYear() + 2} />
              </label>
              <label>
                Label
                <input name="label" placeholder="Primary" />
              </label>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="isDefault" />
              Default card
            </label>
            <button className="btn btn-accent" type="submit">
              Save card on file
            </button>
          </form>
        </SectionCard>
      ) : null}

      {active === "branding" ? (
        <SectionCard title="White-label branding" description="Colors and display name apply live across the practice portal shell when active.">
          <form action={saveBranding} className="ws-message-form">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="active" defaultChecked={Boolean(branding.active)} />
              Branding active
            </label>
            <div className="ws-kv">
              <label>
                Display name
                <input name="displayName" defaultValue={String(branding.displayName || user.org.legalName)} />
              </label>
              <label>
                Tagline
                <input name="tagline" defaultValue={String(branding.tagline || "")} />
              </label>
              <label>
                Primary
                <input name="primary" type="color" defaultValue={String(branding.primary || "#184868")} />
              </label>
              <label>
                Secondary
                <input name="secondary" type="color" defaultValue={String(branding.secondary || "#245a78")} />
              </label>
              <label>
                Accent
                <input name="accent" type="color" defaultValue={String(branding.accent || "#c4a574")} />
              </label>
              <label>
                Support email
                <input name="supportEmail" defaultValue={String(branding.supportEmail || "")} />
              </label>
              <label>
                Support phone
                <input name="supportPhone" defaultValue={String(branding.supportPhone || "")} />
              </label>
              <label>
                Custom domain
                <input
                  name="customDomain"
                  placeholder="portal.yourpractice.com"
                  defaultValue={String(branding.customDomain || "")}
                />
              </label>
            </div>
            <p className="muted">
              Custom domain is stored for ops / DNS checklist. Point CNAME to this app host, then ask Wellness Tech to attach
              it on Vercel — we do not auto-move domains.
            </p>
            <button className="btn btn-accent" type="submit">
              Save branding
            </button>
          </form>
        </SectionCard>
      ) : null}

      {active === "texts" ? (
        <>
          <SectionCard
            title="Twilio SMS"
            description="Connect your Twilio account to text patients from the practice portal (same pattern as Eventide Texts & calls)."
          >
            <form action={saveTwilioSettings} className="ws-message-form">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="twilioEnabled" defaultChecked={Boolean(org?.twilioEnabled)} />
                Enable outbound SMS
              </label>
              <div className="ws-kv">
                <label>
                  Account SID
                  <input name="twilioAccountSid" defaultValue={org?.twilioAccountSid || ""} autoComplete="off" />
                </label>
                <label>
                  Auth token
                  <input
                    name="twilioAuthToken"
                    type="password"
                    defaultValue={org?.twilioAuthToken || ""}
                    autoComplete="off"
                  />
                </label>
                <label>
                  From phone (E.164)
                  <input name="twilioPhone" placeholder="+1…" defaultValue={org?.twilioPhone || ""} />
                </label>
              </div>
              <button className="btn btn-accent" type="submit">
                Save Twilio settings
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Send a text">
            <form action={sendPracticeSms} className="ws-message-form">
              <div className="ws-kv">
                <label>
                  To phone
                  <input name="toPhone" placeholder="+1…" required />
                </label>
              </div>
              <label>
                Message
                <textarea name="body" rows={3} required maxLength={320} />
              </label>
              <button className="btn btn-accent" type="submit">
                Send SMS
              </button>
            </form>
          </SectionCard>

          <SectionCard title="SMS inbox / log">
            {smsMessages.length ? (
              <ul className="ws-message-list">
                {smsMessages.map((m) => (
                  <li key={m.id}>
                    <div className="ws-message-meta">
                      <b>
                        {m.direction} · {m.status}
                      </b>
                      <span className="muted">{m.createdAt.toLocaleString()}</span>
                    </div>
                    <p className="muted">
                      {m.fromPhone} → {m.toPhone}
                    </p>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No SMS yet.</p>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

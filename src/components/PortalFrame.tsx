import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PortalSideNav, type PortalNavGroup } from "@/components/portal/PortalSideNav";
import { logout } from "@/lib/actions";
import { rolesOf } from "@/lib/guard";
import { tierLabel } from "@/lib/rules";

function practiceGroups(billingOnly: boolean): PortalNavGroup[] {
  return [
    {
      label: "Workspace",
      links: [
        { href: "/portal", label: "Dashboard", exact: true },
        { href: "/portal/orders", label: "Orders" },
        { href: "/portal/invoices", label: "Invoices" },
        { href: "/portal/refills", label: "Refills" },
      ],
    },
    {
      label: "Clinical",
      links: [
        ...(billingOnly ? [] : [{ href: "/portal/patients", label: "Patients" }]),
        { href: "/portal/practitioners", label: "Practitioners" },
        { href: "/portal/pharmacies", label: "Pharmacies" },
      ],
    },
    {
      label: "Commerce",
      links: [
        { href: "/portal/catalog", label: "Catalog" },
        { href: "/portal/price-list", label: "Price list" },
        { href: "/portal/office-stock", label: "Office stock" },
        { href: "/portal/cart", label: "Cart" },
      ],
    },
    {
      label: "Operations",
      links: [
        { href: "/portal/reports", label: "Reports" },
        { href: "/portal/messages", label: "Messages" },
        { href: "/portal/education", label: "Education" },
        { href: "/portal/settings", label: "Settings" },
      ],
    },
  ];
}

const adminGroups: PortalNavGroup[] = [
  {
    label: "Workspace",
    links: [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/prescriptions", label: "Prescriptions" },
      { href: "/admin/practices", label: "Practices" },
      { href: "/admin/pharmacies", label: "Pharmacies" },
      { href: "/pharmacy", label: "Pharmacy workspace" },
    ],
  },
  {
    label: "Clinical network",
    links: [
      { href: "/admin/patients", label: "Patients" },
      { href: "/admin/prescribers", label: "Prescribers" },
      { href: "/admin/affiliates", label: "Affiliates" },
      { href: "/admin/products", label: "Catalog" },
      { href: "/admin/refills", label: "Refills" },
    ],
  },
  {
    label: "Finance",
    links: [
      { href: "/admin/settlements", label: "Settlements" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/migration", label: "Migration" },
      { href: "/developers", label: "Developers" },
    ],
  },
];

const pharmacyGroups: PortalNavGroup[] = [
  {
    label: "Fulfillment",
    links: [
      { href: "/pharmacy", label: "Overview", exact: true },
      { href: "/pharmacy/orders", label: "Orders" },
      { href: "/pharmacy/scripts", label: "eScripts" },
    ],
  },
  {
    label: "Pharmacy",
    links: [
      { href: "/pharmacy/profile", label: "Profile" },
      { href: "/pharmacy/locations", label: "Locations" },
      { href: "/pharmacy/staff", label: "Staff" },
      { href: "/pharmacy/reports", label: "Reports" },
    ],
  },
];

const affiliateGroups: PortalNavGroup[] = [
  {
    label: "Partner",
    links: [
      { href: "/portal", label: "Dashboard", exact: true },
      { href: "/portal/affiliate", label: "Commissions" },
      { href: "/portal/education", label: "Materials" },
    ],
  },
];

export function PortalFrame({
  user,
  children,
  workspace,
}: {
  user: {
    name: string;
    email: string;
    roles: string;
    org: { legalName: string; verificationTier: number; assignedRep: string };
  };
  children: React.ReactNode;
  /** Force nav when an admin opens another workspace (e.g. /pharmacy). */
  workspace?: "admin" | "pharmacy" | "practice" | "affiliate";
}) {
  const roles = rolesOf(user.roles);
  const admin = roles.includes("admin") && !roles.some((role) => ["owner", "prescriber", "staff"].includes(role));
  const pharmacyOnly =
    roles.includes("pharmacy") && !roles.some((role) => ["admin", "owner", "prescriber", "staff"].includes(role));
  const billingOnly =
    roles.includes("billing") && !roles.some((role) => ["owner", "prescriber", "staff", "admin"].includes(role));
  const affiliateOnly =
    roles.includes("affiliate") && !roles.some((role) => ["owner", "prescriber", "staff"].includes(role));

  const mode =
    workspace ||
    (admin ? "admin" : pharmacyOnly ? "pharmacy" : affiliateOnly ? "affiliate" : "practice");

  const groups =
    mode === "admin"
      ? adminGroups
      : mode === "pharmacy"
        ? pharmacyGroups
        : mode === "affiliate"
          ? affiliateGroups
          : practiceGroups(billingOnly);
  const home = mode === "admin" ? "/admin" : mode === "pharmacy" ? "/pharmacy" : "/portal";
  const sideLabel = mode === "pharmacy" ? "Pharmacy partner" : admin ? "Administrator" : tierLabel(user.org.verificationTier);

  return (
    <div className="portal">
      <aside className="side">
        <div className="side-top">
          <Link href={home} aria-label="Dashboard">
            <Logo tone="white" />
          </Link>
          <div className="side-meta">
            <strong>{user.org.legalName}</strong>
            <span>{sideLabel}</span>
            {mode === "practice" ? <span>Rep · {user.org.assignedRep}</span> : null}
            <span className="side-user">{user.name}</span>
          </div>
          <form className="side-out-mobile" action={logout}>
            <button className="btn btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <PortalSideNav groups={groups} />
        <div className="side-foot">
          <p className="side-foot-copy">HIPAA-aligned · Licensed pharmacies · Encrypted sessions</p>
          <form className="side-out" action={logout}>
            <button className="btn btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="main">
        <div className="ws-shell">{children}</div>
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { prisma } from "@/lib/prisma";
import { tierLabel } from "@/lib/rules";

export default async function AdminPracticesPage() {
  const practices = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      locations: true,
      _count: { select: { users: true, orders: true, clinicalPatients: true } },
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Practices"
        lede="Onboarding, verification tier, locations, and assigned rep — unlock catalog depth as credentials clear."
      />

      <SectionCard title="All organizations">
        {practices.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Practice</th>
                  <th>Type</th>
                  <th>Onboarding</th>
                  <th>Tier</th>
                  <th>Locations</th>
                  <th>People</th>
                  <th>Orders</th>
                  <th>Patients</th>
                  <th>Rep</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {practices.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <Link href={`/admin/practices/${org.id}`}>
                        <b>{org.legalName}</b>
                      </Link>
                      <div className="muted">{org.slug}</div>
                      {org.referringAffiliateId ? <div className="muted">Affiliate attributed</div> : null}
                    </td>
                    <td>{org.type}</td>
                    <td>
                      <StatusBadge tone={org.onboardingComplete ? "ok" : "warn"}>
                        {org.onboardingComplete ? "complete" : "pending"}
                      </StatusBadge>
                    </td>
                    <td>{tierLabel(org.verificationTier)}</td>
                    <td>{org.locations.length}</td>
                    <td>{org._count.users}</td>
                    <td>{org._count.orders}</td>
                    <td>{org._count.clinicalPatients}</td>
                    <td>{org.assignedRep || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(org.status)}>{org.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No practices yet" body="Signup and KIAN partner orgs appear here." />
        )}
      </SectionCard>
    </div>
  );
}

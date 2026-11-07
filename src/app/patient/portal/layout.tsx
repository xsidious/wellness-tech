import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/actions";
import { requireUser, rolesOf } from "@/lib/guard";
import { redirect } from "next/navigation";

export default async function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/patient/portal");
  const roles = rolesOf(user.roles);
  if (!user.clinicalPatientId && !roles.includes("patient") && !roles.includes("admin")) {
    redirect("/patient");
  }

  return (
    <div className="portal">
      <aside className="side">
        <div className="side-top">
          <Link href="/patient/portal" aria-label="Patient home">
            <Logo tone="white" />
          </Link>
          <div className="side-meta">
            <strong>Patient portal</strong>
            <span>{user.name}</span>
            <span className="side-user">{user.email}</span>
          </div>
        </div>
        <nav className="side-nav">
          <Link href="/patient/portal">My prescriptions</Link>
          <Link href="/patient/portal#refills">Refills</Link>
          <Link href="/patient/portal#messages">Messages</Link>
        </nav>
        <div className="side-foot">
          <form action={logout}>
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

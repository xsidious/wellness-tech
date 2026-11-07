import Link from "next/link";
import { SignaturePad } from "@/components/escript/SignaturePad";
import { PageHeader, SectionCard } from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { createPortalPatient } from "@/lib/practice-actions";
import { redirect } from "next/navigation";

export default async function NewPatientIntakePage() {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (roles.includes("billing") && !roles.some((role) => ["owner", "prescriber", "staff", "admin"].includes(role))) {
    redirect("/portal?notice=billing");
  }

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical"
        title="Patient intake"
        lede="Create a chart in-portal with demographics and consents — same ClinicalPatient model KIAN mirrors into."
        actions={
          <Link className="btn btn-ghost" href="/portal/patients">
            All patients
          </Link>
        }
      />

      <SectionCard title="Demographics & consents">
        <form action={createPortalPatient} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Full name
              <input name="fullName" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <label>
              Date of birth
              <input name="dateOfBirth" placeholder="YYYY-MM-DD" />
            </label>
            <label>
              Gender
              <input name="gender" />
            </label>
            <label>
              Programs
              <input name="programs" placeholder="GLP-1, Peptides" />
            </label>
          </div>
          <label>
            Allergies
            <textarea name="allergies" rows={2} />
          </label>
          <label>
            Medications
            <textarea name="medications" rows={2} />
          </label>
          <div className="ws-kv">
            <label>
              Street
              <input name="street1" />
            </label>
            <label>
              City
              <input name="city" />
            </label>
            <label>
              State
              <input name="state" />
            </label>
            <label>
              ZIP
              <input name="zip" />
            </label>
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="consentHipaa" />
            HIPAA notice acknowledged
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="consentTreatment" />
            Treatment consent acknowledged
          </label>
          <SignaturePad name="consentSignature" label="Patient / guardian consent signature" />
          <button className="btn btn-accent" type="submit">
            Save chart
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

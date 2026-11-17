import { encryptField } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "alenbeslijaaa@gmail.com";
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { org: true, credential: true },
  });
  if (!user) throw new Error("user missing");

  const org = await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      verificationTier: Math.max(user.org.verificationTier, 2),
      onboardingComplete: true,
    },
  });

  const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
  const licenseNumber = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";
  const licenseState = process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL";

  const credential = user.credential
    ? await prisma.prescriberCredential.update({
        where: { userId: user.id },
        data: {
          npi,
          displayName: user.name,
          verificationTier: Math.max(user.credential.verificationTier, 2),
          licenseCipher: user.credential.licenseCipher || encryptField(licenseNumber),
          licensesJson: JSON.stringify([{ state: licenseState, licenseNumber }]),
        },
      })
    : await prisma.prescriberCredential.create({
        data: {
          userId: user.id,
          npi,
          displayName: user.name,
          specialty: "Practice owner",
          verificationTier: 2,
          licenseCipher: encryptField(licenseNumber),
          licensesJson: JSON.stringify([{ state: licenseState, licenseNumber }]),
        },
      });

  const self =
    (await prisma.clinicalPatient.findFirst({
      where: {
        orgId: user.orgId,
        email: { equals: user.email, mode: "insensitive" },
        kianIntakeId: "",
      },
    })) ||
    (await prisma.clinicalPatient.create({
      data: {
        orgId: user.orgId,
        email: user.email,
        fullName: user.name,
        phone: "",
        kianIntakeId: "",
        sourceSite: "portal-self",
      },
    }));

  console.log(
    JSON.stringify(
      {
        email: user.email,
        roles: user.roles,
        orgTier: org.verificationTier,
        credentialNpi: credential.npi,
        credentialTier: credential.verificationTier,
        selfPatientId: self.id,
        selfPatientName: self.fullName,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

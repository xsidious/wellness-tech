/** Mirrors PartnerClinicSite in partner-org (kept free of server imports for client UI). */
export type ClinicOwnerSite =
  | "kian-prive"
  | "facial-design"
  | "4everglow"
  | "threefold-strength"
  | "hope-and-haven";

export type ClinicOwnerSeed = {
  site: ClinicOwnerSite;
  email: string;
  name: string;
  clinicCode: string;
};

/** Human portal owners for each connected clinic (not the synthetic orders@ API users). */
export const CLINIC_OWNER_SEEDS: ClinicOwnerSeed[] = [
  {
    site: "kian-prive",
    email: "privekian8@gmail.com",
    name: "KIAN Privé Admin",
    clinicCode: "kianprive",
  },
  {
    site: "facial-design",
    email: "admin@facialdesignstudio.com",
    name: "Facial Design Admin",
    clinicCode: "facialdesign",
  },
  {
    site: "4everglow",
    email: "admin@4everglow.com",
    name: "4everglow Admin",
    clinicCode: "4everglow",
  },
  {
    site: "threefold-strength",
    email: "admin@threefoldstrength.com",
    name: "Threefold Admin",
    clinicCode: "threefold",
  },
  {
    site: "hope-and-haven",
    email: "info@hopeandhavenint.com",
    name: "Hope & Haven Admin",
    clinicCode: "hopehaven",
  },
];

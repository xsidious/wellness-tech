import { parseJsonSafe } from "@/lib/clinical-chart";
import { rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export type PharmacyUser = {
  id: string;
  pharmacyId: string | null;
  roles: string;
  name: string;
  email: string;
};

export async function resolvePharmacyScope(user: PharmacyUser) {
  const roles = rolesOf(user.roles);
  const isAdmin = roles.includes("admin");
  const pharmacy = user.pharmacyId
    ? await prisma.pharmacy.findUnique({
        where: { id: user.pharmacyId },
        include: {
          locations: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
          users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, roles: true, lastLoginAt: true } },
          _count: { select: { orders: true, locations: true, users: true } },
        },
      })
    : isAdmin
      ? await prisma.pharmacy.findFirst({
          orderBy: { name: "asc" },
          include: {
            locations: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
            users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, roles: true, lastLoginAt: true } },
            _count: { select: { orders: true, locations: true, users: true } },
          },
        })
      : null;

  const orderWhere = user.pharmacyId
    ? { pharmacyId: user.pharmacyId }
    : isAdmin && pharmacy
      ? { pharmacyId: pharmacy.id }
      : isAdmin
        ? {}
        : { pharmacyId: "__none__" };

  return {
    isAdmin,
    pharmacy,
    pharmacyId: pharmacy?.id || user.pharmacyId || null,
    orderWhere,
    specialties: parseJsonSafe<string[]>(pharmacy?.specialtiesJson, []),
    capabilities: parseJsonSafe<string[]>(pharmacy?.capabilitiesJson, []),
    erp: parseJsonSafe<string[]>(pharmacy?.erpJson, []),
  };
}

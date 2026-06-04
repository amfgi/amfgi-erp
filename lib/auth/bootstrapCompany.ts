import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { ensureDefaultEmployeeDocumentTypes } from '@/lib/hr/defaultDocumentTypes';
import { DEFAULT_EMPLOYEE_TYPE_SETTINGS } from '@/lib/hr/employeeTypeSettings';
import { ensureAllSystemRoles } from '@/lib/auth/systemRoles';
import { mergeStockControlSettingsIntoCompanySettings } from '@/lib/stock-control/settings';
import { companySeedPrintTemplates } from '@/scripts/seed-print-templates';

const DEFAULT_OPERATIONAL_SETTINGS: Prisma.InputJsonValue = {
  inventoryValuationMethod: 'FIFO',
  currencyCode: 'AED',
  allowNegativeStock: false,
  stockDispatchPolicy: 'BLOCK_IF_INSUFFICIENT',
  stockReservationMode: 'SOFT',
  autoCreateStockBatches: true,
};

export type BootstrapAdminInput = {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  companyName: string;
  companySlug: string;
};

export type BootstrapAdminResult = {
  companyId: string;
  companyName: string;
  companySlug: string;
  userId: string;
  userEmail: string;
};

function slugifyCompanySlug(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'main'
  );
}

/** Creates company, system roles, and first super-admin user. Caller must ensure user count is zero. */
export async function bootstrapFirstAdmin(
  db: PrismaClient,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const companySlug = slugifyCompanySlug(input.companySlug);
  const printTemplates = companySeedPrintTemplates as unknown as Prisma.InputJsonValue;

  const company = await db.company.create({
    data: {
      id: randomUUID(),
      name: input.companyName.trim() || 'My Company',
      slug: companySlug,
      jobSourceMode: 'HYBRID',
      warehouseMode: 'REQUIRED',
      onboardingStatus: 'OPERATIONAL',
      foundationChecklist: {
        profileReady: true,
        warehouseReady: true,
        operationalReady: true,
      } as Prisma.InputJsonValue,
      operationalSettings: DEFAULT_OPERATIONAL_SETTINGS,
      settingsVersion: 1,
      isActive: true,
      jobCostingSettings: mergeStockControlSettingsIntoCompanySettings(
        { nonWorkingWeekdays: [0] },
        { negativeEvidenceQtyThreshold: 10, negativeDecisionNoteQtyThreshold: 25 },
      ) as Prisma.InputJsonValue,
      hrEmployeeTypeSettings: DEFAULT_EMPLOYEE_TYPE_SETTINGS as unknown as Prisma.InputJsonValue,
      printTemplates,
    },
  });

  await ensureDefaultEmployeeDocumentTypes(db, company.id);

  const systemRoles = await ensureAllSystemRoles(db);
  const superAdminRoleId = systemRoles.admin?.id;
  if (!superAdminRoleId) {
    throw new Error('Failed to create admin system role.');
  }

  const passwordHash = await bcrypt.hash(input.adminPassword, 12);

  const user = await db.user.create({
    data: {
      name: input.adminName.trim() || 'Administrator',
      email: adminEmail,
      password: passwordHash,
      isSuperAdmin: true,
      isActive: true,
      activeCompanyId: company.id,
      companyAccess: {
        create: {
          companyId: company.id,
          roleId: superAdminRoleId,
        },
      },
    },
  });

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    userId: user.id,
    userEmail: user.email,
  };
}

export { slugifyCompanySlug };

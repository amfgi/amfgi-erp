/**
 * Production bootstrap seed — minimal data only:
 *   • One company with full print templates: all delivery-note layouts plus work-schedule (HR) print formats
 *     (same `companySeedPrintTemplates` as `scripts/seed.ts` → `scripts/seed-print-templates.ts`)
 *   • System roles: one `Role` per `ROLE_PRESETS` entry (Admin / Manager / Store Keeper) + one super-admin user
 *   • Default HR employee document types for the company (same lightweight helper as full seed)
 *
 * Intended for an empty database (no users). If any user already exists, the script exits without changes.
 *
 * Environment:
 *   - DATABASE_URL (required)
 *   - SEED_ADMIN_EMAIL (optional, default: first user email you should change after login)
 *   - SEED_ADMIN_PASSWORD (required, min 12 characters)
 *   - SEED_ADMIN_NAME (optional)
 *   - SEED_COMPANY_NAME / SEED_COMPANY_SLUG (optional)
 *   - When NODE_ENV=production, set ALLOW_PRODUCTION_SEED=true or the script aborts (foot-gun guard)
 *
 * Run: npx tsx scripts/seed-production.ts
 * Or:  npm run seed:production
 */

import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { createPostgresAdapter } from '../lib/db/postgresAdapter';
import { ensureDefaultEmployeeDocumentTypes } from '../lib/hr/defaultDocumentTypes';
import { DEFAULT_EMPLOYEE_TYPE_SETTINGS } from '../lib/hr/employeeTypeSettings';
import { ROLE_PRESETS } from '../lib/permissions';
import { mergeStockControlSettingsIntoCompanySettings } from '../lib/stock-control/settings';
import { companySeedPrintTemplates } from './seed-print-templates';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error(
    'Refusing to run in production without ALLOW_PRODUCTION_SEED=true (set explicitly after reviewing this script).',
  );
}

const prisma = new PrismaClient({
  adapter: createPostgresAdapter(databaseUrl),
  log: ['error', 'warn'],
});

const DEFAULT_OPERATIONAL_SETTINGS: Prisma.InputJsonValue = {
  inventoryValuationMethod: 'FIFO',
  currencyCode: 'AED',
  allowNegativeStock: false,
  stockDispatchPolicy: 'BLOCK_IF_INSUFFICIENT',
  stockReservationMode: 'SOFT',
  autoCreateStockBatches: true,
};

async function main() {
  console.log('Production bootstrap seed\n');

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Skipped: database already has ${existingUsers} user(s). No changes made.`);
    return;
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be set and at least 12 characters.');
  }

  const adminName = (process.env.SEED_ADMIN_NAME ?? 'Administrator').trim() || 'Administrator';
  const companyName = (process.env.SEED_COMPANY_NAME ?? 'My Company').trim() || 'My Company';
  const companySlug = (process.env.SEED_COMPANY_SLUG ?? 'main')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'main';

  const printTemplates = companySeedPrintTemplates as unknown as Prisma.InputJsonValue;

  const systemPresetRoles: Array<{
    preset: keyof typeof ROLE_PRESETS;
    name: string;
    slug: string;
  }> = [
    { preset: 'super_admin', name: 'Admin', slug: 'admin' },
    { preset: 'manager', name: 'Manager', slug: 'manager' },
    { preset: 'store_keeper', name: 'Store Keeper', slug: 'store-keeper' },
  ];

  const presetKeys = new Set(Object.keys(ROLE_PRESETS) as (keyof typeof ROLE_PRESETS)[]);
  const seededKeys = new Set(systemPresetRoles.map((r) => r.preset));
  if (presetKeys.size !== seededKeys.size || [...presetKeys].some((k) => !seededKeys.has(k))) {
    throw new Error(
      'seed-production: extend `systemPresetRoles` with name/slug for every key in `ROLE_PRESETS`.',
    );
  }

  const company = await prisma.company.create({
    data: {
      id: randomUUID(),
      name: companyName,
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

  await ensureDefaultEmployeeDocumentTypes(prisma, company.id);

  let superAdminRoleId: string | null = null;
  for (const def of systemPresetRoles) {
    const role = await prisma.role.create({
      data: {
        name: def.name,
        slug: def.slug,
        permissions: ROLE_PRESETS[def.preset],
        isSystem: true,
      },
    });
    if (def.preset === 'super_admin') superAdminRoleId = role.id;
  }

  if (!superAdminRoleId) {
    throw new Error('Failed to create super_admin preset role.');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.create({
    data: {
      name: adminName,
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

  const dnCount = companySeedPrintTemplates.filter((t) => t.itemType === 'delivery-note').length;
  const scheduleCount = companySeedPrintTemplates.filter((t) => t.itemType === 'work-schedule').length;

  console.log(`Company: ${company.name} (slug: ${company.slug})`);
  console.log(
    `Print templates: ${companySeedPrintTemplates.length} total (${dnCount} delivery-note, ${scheduleCount} work-schedule)`,
  );
  console.log(`Roles: ${systemPresetRoles.map((r) => r.slug).join(', ')} (from ROLE_PRESETS)`);
  console.log(`User: ${adminEmail} (super admin + Admin role from ROLE_PRESETS.super_admin)`);
  console.log('\nDone. Sign in with the credentials from your environment, then change the password in Profile.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

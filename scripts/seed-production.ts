/**
 * Production bootstrap seed — minimal data only:
 *   • One company with full print templates
 *   • System roles from ROLE_PRESETS + one super-admin user
 *
 * Intended for an empty database. If any user exists, exits without changes.
 * Alternatively use the web UI at /login when no users exist (first-time setup).
 *
 * Environment:
 *   - DATABASE_URL (required)
 *   - SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (min 12), optional SEED_ADMIN_NAME, SEED_COMPANY_*
 *   - When NODE_ENV=production, set ALLOW_PRODUCTION_SEED=true
 *
 * Run: npm run seed:production
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter } from '../lib/db/postgresAdapter';
import { resolveDatabaseUrlForScripts } from '../lib/db/resolveDatabaseUrl';
import { bootstrapFirstAdmin, slugifyCompanySlug } from '../lib/auth/bootstrapCompany';
import { companySeedPrintTemplates } from './seed-print-templates';

const databaseUrl = resolveDatabaseUrlForScripts('seed');

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error(
    'Refusing to run in production without ALLOW_PRODUCTION_SEED=true (set explicitly after reviewing this script).',
  );
}

const prisma = new PrismaClient({
  adapter: createPostgresAdapter(databaseUrl),
  log: ['error', 'warn'],
});

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
  const companySlug = slugifyCompanySlug(process.env.SEED_COMPANY_SLUG ?? 'main');

  const result = await bootstrapFirstAdmin(prisma, {
    adminName,
    adminEmail,
    adminPassword,
    companyName,
    companySlug,
  });

  const dnCount = companySeedPrintTemplates.filter((t) => t.itemType === 'delivery-note').length;
  const scheduleCount = companySeedPrintTemplates.filter((t) => t.itemType === 'work-schedule').length;

  console.log(`Company: ${result.companyName} (slug: ${result.companySlug})`);
  console.log(
    `Print templates: ${companySeedPrintTemplates.length} total (${dnCount} delivery-note, ${scheduleCount} work-schedule)`,
  );
  console.log(`User: ${result.userEmail} (super admin)`);
  console.log('\nDone. Sign in with your credentials, then change the password if needed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

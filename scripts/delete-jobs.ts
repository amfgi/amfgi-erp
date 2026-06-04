import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter } from '../lib/db/postgresAdapter';
import { resolveDatabaseUrlForScripts } from '../lib/db/resolveDatabaseUrl';

const databaseUrl = resolveDatabaseUrlForScripts('seed');

const prisma = new PrismaClient({
  adapter: createPostgresAdapter(databaseUrl),
  log: ['error', 'warn'],
});

async function seed() {
  console.log('🌱 Starting Prisma seed…\n');

  // ── Delete old data (clean slate) ────────────────────────────────────────────
  console.log('Clearing old data…');
 
  await prisma.job.deleteMany({});

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const directDatabaseUrl =
  process.env.DIRECT_DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Migrations need direct TCP; Accelerate is for app queries only.
    url: directDatabaseUrl ?? env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations-postgres',
    seed: 'npx tsx scripts/seed.ts',
  },
});

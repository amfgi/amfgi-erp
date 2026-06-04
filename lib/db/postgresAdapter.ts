import { PrismaPg } from '@prisma/adapter-pg';
import { resolvePostgresPoolConfig } from './postgresPoolConfig';

export type PostgresPrismaAdapter = PrismaPg;

export function createPostgresAdapter(connectionString: string): PostgresPrismaAdapter {
  return new PrismaPg(resolvePostgresPoolConfig(connectionString));
}

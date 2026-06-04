import 'dotenv/config';
import { Pool } from 'pg';
import { resolvePostgresPoolConfig } from '../lib/db/postgresPoolConfig';
import { resolveDatabaseUrlForScripts } from '../lib/db/resolveDatabaseUrl';

async function main() {
  const cfg = resolvePostgresPoolConfig(resolveDatabaseUrlForScripts('seed'));
  console.log('ssl config:', cfg.ssl);
  const pool = new Pool(cfg);
  const result = await pool.query('SELECT 1 AS ok');
  console.log('connected:', result.rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * VPS / Docker production build — skips Next.js in-build TypeScript (run `npm run typecheck` locally first).
 */
import { spawnSync } from 'node:child_process';

process.env.SKIP_NEXT_TYPECHECK = '1';

const result = spawnSync(
	process.execPath,
	['--max-old-space-size=1536', './node_modules/next/dist/bin/next', 'build'],
	{ stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 1);

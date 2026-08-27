import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPool } from './pool';

/**
 * Minimal, dependency-free SQL migration runner.
 * Files in packages/database/migrations/*.sql are applied in lexical order,
 * each inside a transaction, and recorded in schema_migrations.
 */
export async function runMigrations(databaseUrl: string, log: (msg: string) => void = console.log): Promise<void> {
  const dir = resolveMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const pool = createPool(databaseUrl);
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    const appliedRes = await pool.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.name as string));
    for (const file of files) {
      if (applied.has(file)) {
        log(`= ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(path.join(dir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`+ ${file} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

function resolveMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', 'migrations'), // src/ or dist/ layout
    path.join(here, 'migrations'),
    path.join(process.cwd(), 'packages', 'database', 'migrations'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`Migrations directory not found. Tried: ${candidates.join(', ')}`);
}

/** CLI wrapper — separate entry so bundlers never trigger it as a side effect. */
export function migrateCliMain(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set — nothing to migrate (memory mode needs no migrations).');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log('Migrations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}

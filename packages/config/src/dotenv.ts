import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Minimal, dependency-free .env loader.
 * Looks for a `.env` file starting at `startDir` and walking up (so it finds
 * the repo root whether the process runs from the root, apps/api, or a dist
 * folder). Values already present in process.env always win — a real
 * environment variable overrides the file. Returns the loaded file path, or
 * null when none was found (e.g. Docker, where env comes from the runtime).
 */
export function loadDotEnv(startDir: string = process.cwd(), maxLevelsUp = 4): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i <= maxLevelsUp; i += 1) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      applyEnvFile(file);
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function applyEnvFile(file: string): void {
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

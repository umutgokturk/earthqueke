#!/usr/bin/env node
/**
 * Web launcher: `node scripts/serve.mjs dev|start`
 * Reads the repo-root .env so ports live in ONE place:
 *   WEB_PORT  → the port Next.js binds (default 3000)
 *   API_PORT  → derives API_PROXY_TARGET and NEXT_PUBLIC_WS_URL defaults
 * Real environment variables always override the .env file. Cross-platform
 * (spawns the Next binary via node directly — no shell quirks on Windows).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvFile = path.resolve(webDir, '..', '..', '.env');

const fileEnv = {};
if (existsSync(rootEnvFile)) {
  // BOM stripped — Windows editors and PowerShell often write one.
  const text = readFileSync(rootEnvFile, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    fileEnv[key] = value;
  }
}

const get = (key, fallback) => {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  const fromFile = fileEnv[key];
  if (fromFile !== undefined && fromFile !== '') return fromFile;
  return fallback;
};

const webPort = get('WEB_PORT', get('PORT', '3000'));
const apiPort = get('API_PORT', '4000');
const env = {
  ...process.env,
  API_PROXY_TARGET: get('API_PROXY_TARGET', `http://localhost:${apiPort}`),
  NEXT_PUBLIC_WS_URL: get('NEXT_PUBLIC_WS_URL', `ws://localhost:${apiPort}/ws`),
};
const maptilerKey = get('NEXT_PUBLIC_MAPTILER_KEY', undefined);
if (maptilerKey) env.NEXT_PUBLIC_MAPTILER_KEY = maptilerKey;

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

console.log(
  `[web] next ${mode} → http://localhost:${webPort}  (API proxy: ${env.API_PROXY_TARGET}, WS: ${env.NEXT_PUBLIC_WS_URL})`,
);
const child = spawn(process.execPath, [nextBin, mode, '-p', String(webPort)], {
  cwd: webDir,
  stdio: 'inherit',
  env,
});
child.on('exit', (code) => process.exit(code ?? 0));

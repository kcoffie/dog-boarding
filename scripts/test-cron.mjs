/**
 * Local integration test runner for cron handlers.
 * Usage: node scripts/test-cron.mjs [auth|schedule|detail|all]
 *
 * Loads .env.local, then calls the handler with a mock Express req/res.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  if (!process.env[key]) process.env[key] = val;
}

function makeReqRes() {
  const res = { _code: null, _body: null };
  res.status = (code) => {
    res._code = code;
    return {
      json: (data) => {
        res._body = data;
        return res;
      },
    };
  };
  const req = { method: 'GET', headers: {} };
  return { req, res };
}

async function runHandler(name, importPath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));

  try {
    const mod = await import(importPath);
    const handler = mod.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    console.log(`HTTP ${res._code}`);
    console.log(JSON.stringify(res._body, null, 2));
  } catch (err) {
    console.error('Handler threw:', err.message);
    console.error(err.stack);
  }
}

const target = process.argv[2] || 'all';
const root = `file://${resolve(process.cwd(), 'api')}`;

if (target === 'auth' || target === 'all') {
  await runHandler('cron-auth', `${root}/cron-auth.js`);
}
if (target === 'schedule' || target === 'all') {
  await runHandler('cron-schedule', `${root}/cron-schedule.js`);
}
if (target === 'detail' || target === 'all') {
  await runHandler('cron-detail', `${root}/cron-detail.js`);
}

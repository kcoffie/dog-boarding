// Host-zone switching for tests of site clock readers (#353, ADR-009).
// Every stored booking time is 07:00–17:15Z, so UTC, Pacific, Paris and Tokyo give 10:00Z
// the same date even with getDate(). In Kiritimati (+14) 10:00Z is the next day; in
// Pago Pago (−11) the day before. Same harness as siteClock.test.js.
import { it, expect } from 'vitest';

export const ZONES = ['UTC', 'America/Los_Angeles', 'Europe/Paris', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const JANUARY_OFFSET = {
  UTC: 0, 'America/Los_Angeles': 480, 'Europe/Paris': -60, 'Asia/Tokyo': -540,
  'Pacific/Kiritimati': -840, 'Pacific/Pago_Pago': 660,
};

const originalTZ = process.env.TZ;
// Node re-reads TZ on assignment, but only on the main thread (vitest forks). In a worker
// thread (Stryker) it does nothing: only the host's own zone runs, the rest show as skipped.
const onHost = (zone) => {
  process.env.TZ = zone;
  expect(new Date(2026, 0, 15).getTimezoneOffset(), `host timezone switch to ${zone}`).toBe(JANUARY_OFFSET[zone]);
};
const HOST_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CAN_SWITCH = (() => {
  const before = process.env.TZ;
  // Two different zones, so a host already in one of them can't pass the probe
  process.env.TZ = 'Pacific/Kiritimati';
  const east = new Date(2026, 0, 15).getTimezoneOffset() === -840;
  process.env.TZ = 'Pacific/Pago_Pago';
  const switched = east && new Date(2026, 0, 15).getTimezoneOffset() === 660;
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
  return switched;
})();
const hostIt = (zone) => (CAN_SWITCH || zone === HOST_ZONE ? it : it.skip);

// One test per host zone, named "<name> (host in <zone>)"
export const eachZone = (name, fn) => {
  for (const zone of ZONES) hostIt(zone)(`${name} (host in ${zone})`, async () => { onHost(zone); await fn(); });
};

// Put back the host's zone (call from afterEach)
export const restoreHostZone = () => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
};

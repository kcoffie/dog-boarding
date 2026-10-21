/**
 * The production gap between booking-site requests. The shared test setup sets it to 0 so tests
 * don't wait, so this reads config.js itself.
 * @requirements REQ-657
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('REQ-657: the booking-site pacing gap', () => {
  it('config.js paces booking-site requests 1.5 s apart', () => {
    const source = readFileSync('src/lib/scraper/config.js', 'utf8');
    expect(source).toMatch(/^\s*delayBetweenRequests: 1500,/m);
  });
});

/**
 * Tests for gmail-monitor.js pure logic functions.
 * @requirements REQ-v5.0-M2
 *
 * Covers:
 *   - classifyEmail: self-skip, sender+subject matching, subject mismatch, no match
 *   - SELF_SKIP_SUBJECTS: prevents alert loop on Gmail Monitor's own GH Actions failures
 */

import { describe, it, expect } from 'vitest';
import { classifyEmail, SELF_SKIP_SUBJECTS } from '../../scripts/gmail-monitor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GH_ACTIONS_FROM = 'notifications@github.com';
const VERCEL_FROM = 'notifications@vercel.com';
const SUPABASE_FROM = 'ant.wilson@supabase.com';
const UNKNOWN_FROM = 'noreply@someothertool.io';

// ---------------------------------------------------------------------------
// Self-skip
// ---------------------------------------------------------------------------

describe('SELF_SKIP_SUBJECTS', () => {
  it('matches "Gmail Monitor" exactly', () => {
    expect(SELF_SKIP_SUBJECTS[0].test('[dog-boarding] Run failed: Gmail Monitor')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(SELF_SKIP_SUBJECTS[0].test('gmail monitor run failed')).toBe(true);
    expect(SELF_SKIP_SUBJECTS[0].test('GMAIL MONITOR')).toBe(true);
  });

  it('matches with hyphen separator (gmail-monitor)', () => {
    expect(SELF_SKIP_SUBJECTS[0].test('[dog-boarding] Run failed: gmail-monitor')).toBe(true);
  });

  it('does NOT match unrelated subjects', () => {
    expect(SELF_SKIP_SUBJECTS[0].test('[dog-boarding] Run failed: Notify 4am PST')).toBe(false);
    expect(SELF_SKIP_SUBJECTS[0].test('Vercel build Failed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — self-skip
// ---------------------------------------------------------------------------

describe('classifyEmail — self-skip', () => {
  it('skips Gmail Monitor own failure email (prevents alert burst on OAuth expiry)', () => {
    const email = {
      id: 'abc123',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Run failed: Gmail Monitor',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(false);
  });

  it('self-skip fires before sender matching — no senderConfig returned', () => {
    const email = {
      id: 'abc123',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Some jobs were not successful: gmail monitor',
    };
    const { senderConfig, matched } = classifyEmail(email);
    expect(matched).toBe(false);
    expect(senderConfig).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — GitHub Actions
// ---------------------------------------------------------------------------

describe('classifyEmail — GitHub Actions', () => {
  it('matches "run failed" subject', () => {
    const email = {
      id: 'gh1',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Run failed: Notify 4am PST',
    };
    const { senderConfig, matched } = classifyEmail(email);
    expect(matched).toBe(true);
    expect(senderConfig.name).toBe('GitHub Actions');
  });

  it('matches "some jobs were not successful" subject', () => {
    const email = {
      id: 'gh2',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Some jobs were not successful',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(true);
  });

  it('matches "all jobs have failed" subject', () => {
    const email = {
      id: 'gh3',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] All jobs have failed',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(true);
  });

  it('does NOT match a PR comment email from GitHub (subject mismatch)', () => {
    const email = {
      id: 'gh4',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] kcoffie commented on your pull request',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(false);
  });

  it('does NOT match a merge success email (no failure keyword)', () => {
    const email = {
      id: 'gh5',
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Workflow succeeded: Deploy',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — Vercel
// ---------------------------------------------------------------------------

describe('classifyEmail — Vercel', () => {
  it('matches Vercel failure email', () => {
    const email = {
      id: 'vc1',
      from: VERCEL_FROM,
      subject: 'Your deployment Failed on dog-boarding',
    };
    const { senderConfig, matched } = classifyEmail(email);
    expect(matched).toBe(true);
    expect(senderConfig.name).toBe('Vercel');
  });

  it('does NOT match Vercel success email', () => {
    const email = {
      id: 'vc2',
      from: VERCEL_FROM,
      subject: 'Your deployment was successful',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — Supabase
// ---------------------------------------------------------------------------

describe('classifyEmail — Supabase', () => {
  it('matches any Supabase email regardless of subject', () => {
    const email = {
      id: 'sb1',
      from: SUPABASE_FROM,
      subject: 'Your project is approaching its limits',
    };
    const { senderConfig, matched } = classifyEmail(email);
    expect(matched).toBe(true);
    expect(senderConfig.name).toBe('Supabase');
  });

  it('matches Supabase from another @supabase.com address', () => {
    const email = {
      id: 'sb2',
      from: 'support@supabase.com',
      subject: 'Weekly usage report',
    };
    const { matched } = classifyEmail(email);
    expect(matched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — unknown sender
// ---------------------------------------------------------------------------

describe('classifyEmail — unknown sender', () => {
  it('returns matched=false for unknown sender', () => {
    const email = {
      id: 'unk1',
      from: UNKNOWN_FROM,
      subject: 'Something failed',
    };
    const { senderConfig, matched } = classifyEmail(email);
    expect(matched).toBe(false);
    expect(senderConfig).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyEmail — id handling
// ---------------------------------------------------------------------------

describe('classifyEmail — id field', () => {
  it('handles missing id gracefully (uses "(no id)" fallback)', () => {
    const email = {
      from: GH_ACTIONS_FROM,
      subject: '[dog-boarding] Run failed: Cron Auth',
    };
    // Should not throw even without id field
    expect(() => classifyEmail(email)).not.toThrow();
    const { matched } = classifyEmail(email);
    expect(matched).toBe(true);
  });
});

/**
 * integration-check sendReport: when the report goes out, and what the run's exit code is (REQ-620, REQ-652).
 * @requirements REQ-620, REQ-652
 *
 * Boundary faked: alertAndLog (tested in alertKate.test.js); exitCodeAfterAlert stays real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/alertKate.js', async (importOriginal) => ({
  ...(await importOriginal()),
  alertAndLog: vi.fn(),
}));
const { alertAndLog } = await import('../lib/alertKate.js');
const { sendReport } = await import('../../scripts/integration-check.js');

const DB = { fake: 'supabase' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('REQ-652: integration-check report and exit code', () => {
  it('a needed report goes to Kate under the integration-check job', async () => {
    alertAndLog.mockResolvedValue(true);
    await sendReport(DB, '⚠️ Integration check found issues (10/19)', true);
    expect(alertAndLog).toHaveBeenCalledWith(DB, 'integration-check', '⚠️ Integration check found issues (10/19)');
  });

  it('discrepancies alone, report delivered: exit 0 (issues are the report, not a job failure)', async () => {
    alertAndLog.mockResolvedValue(true);
    expect(await sendReport(DB, 'issues', true)).toBe(0);
  });

  it('a needed report that was not delivered: exit 1', async () => {
    alertAndLog.mockResolvedValue(false);
    expect(await sendReport(DB, 'issues', true)).toBe(1);
  });

  it('a passing run 2 or 3 sends no report and exits 0', async () => {
    expect(await sendReport(DB, 'all good', false)).toBe(0);
    expect(alertAndLog).not.toHaveBeenCalled();
  });
});

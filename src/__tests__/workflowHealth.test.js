/**
 * Scheduled workflow keep-alive. Expected values come from REQ-650's acceptance criteria.
 * @requirements REQ-650
 *
 * GitHub's API is the only boundary: listWorkflows / enableWorkflow are fakes that return
 * the shape of GET /repos/{owner}/{repo}/actions/workflows entries.
 */

import { describe, it, expect } from 'vitest';
import { classifyWorkflows, runKeepalive } from '../lib/workflowHealth.js';

const wf = (id, name, state, path = `.github/workflows/${name}.yml`) => ({ id, name, path, state });

function fakeGitHub(workflows, { failIds = [] } = {}) {
  const enabled = [];
  return {
    enabled,
    listWorkflows: async () => workflows,
    enableWorkflow: async (id) => {
      if (failIds.includes(id)) throw new Error('HTTP 403');
      enabled.push(id);
    },
  };
}

describe('classifyWorkflows', () => {
  it('an active workflow is refreshed', () => {
    const r = classifyWorkflows([wf(1, 'notify-4am', 'active')]);
    expect(r.refresh.map((w) => w.id)).toEqual([1]);
  });

  it('a workflow disabled for inactivity is reported, not refreshed', () => {
    const r = classifyWorkflows([wf(2, 'notify-7am', 'disabled_inactivity')]);
    expect(r.inactive.map((w) => w.id)).toEqual([2]);
    expect(r.refresh).toEqual([]);
  });

  it('a manually disabled workflow is left alone', () => {
    const r = classifyWorkflows([wf(3, 'gmail-monitor', 'disabled_manually')]);
    expect(r.manual.map((w) => w.id)).toEqual([3]);
    expect(r.refresh).toEqual([]);
    expect(r.inactive).toEqual([]);
  });

  it("GitHub's built-in workflows (outside .github/workflows/) are skipped", () => {
    const r = classifyWorkflows([wf(4, 'Dependabot Updates', 'active', 'dynamic/dependabot/dependabot-updates')]);
    expect(r.refresh).toEqual([]);
  });

  it('a path that only contains .github/workflows/ further in is skipped', () => {
    const r = classifyWorkflows([wf(5, 'odd', 'active', 'vendor/.github/workflows/odd.yml')]);
    expect(r.refresh).toEqual([]);
  });
});

describe('runKeepalive', () => {
  it('refreshes every active workflow and passes when nothing is disabled', async () => {
    const gh = fakeGitHub([wf(1, 'notify-4am', 'active'), wf(9, 'keepalive', 'active')]);
    const r = await runKeepalive(gh);
    expect(gh.enabled).toEqual([1, 9]);
    expect(r.ok).toBe(true);
  });

  it('fails and names a workflow disabled for inactivity, without re-enabling it', async () => {
    const gh = fakeGitHub([wf(1, 'notify-4am', 'active'), wf(2, 'notify-7am', 'disabled_inactivity')]);
    const r = await runKeepalive(gh);
    expect(gh.enabled).toEqual([1]);
    expect(r.ok).toBe(false);
    expect(r.inactive).toEqual(['notify-7am']);
  });

  it('a manually disabled workflow is not a failure', async () => {
    const gh = fakeGitHub([wf(1, 'notify-4am', 'active'), wf(3, 'gmail-monitor', 'disabled_manually')]);
    const r = await runKeepalive(gh);
    expect(r.ok).toBe(true);
    expect(r.manual).toEqual(['gmail-monitor']);
  });

  it('a failed enable call fails the run, names the workflow, and the rest are still refreshed', async () => {
    const gh = fakeGitHub(
      [wf(1, 'notify-4am', 'active'), wf(2, 'notify-7am', 'active'), wf(3, 'notify-830am', 'active')],
      { failIds: [2] },
    );
    const r = await runKeepalive(gh);
    expect(gh.enabled).toEqual([1, 3]);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([{ name: 'notify-7am', error: 'HTTP 403' }]);
    expect(r.refreshed).toEqual(['notify-4am', 'notify-830am']);
  });

  it('a repo with no workflows of its own fails (the keep-alive itself should always be listed)', async () => {
    const gh = fakeGitHub([wf(4, 'Dependabot Updates', 'active', 'dynamic/dependabot/dependabot-updates')]);
    const r = await runKeepalive(gh);
    expect(r.ok).toBe(false);
  });
});

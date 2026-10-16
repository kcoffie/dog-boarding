/**
 * Scheduled workflow keep-alive (REQ-650).
 *
 * GitHub disables a repo's scheduled workflows after 60 days without a commit; it happened on
 * 2026-08-24 and stopped every notification silently. Calling the enable endpoint on an active
 * workflow refreshes it. A workflow already disabled for inactivity is reported, not re-enabled:
 * turning notifications back on is Kate's call.
 *
 * GitHub is passed in (listWorkflows / enableWorkflow) so the rules can be tested without it.
 * @requirements REQ-650
 */

const WORKFLOW_DIR = '.github/workflows/';

/**
 * Sort the repo's workflows by what the keep-alive does with them.
 * @param {Array<{id:number,name:string,path:string,state:string}>} workflows
 */
export function classifyWorkflows(workflows) {
  const result = { refresh: [], inactive: [], manual: [] };
  for (const w of workflows) {
    if (!w.path.startsWith(WORKFLOW_DIR)) continue; // GitHub's own (e.g. Dependabot)
    if (w.state === 'active') result.refresh.push(w);
    else if (w.state === 'disabled_inactivity') result.inactive.push(w);
    else if (w.state === 'disabled_manually') result.manual.push(w);
  }
  return result;
}

/**
 * Refresh every active workflow. `ok` is false when any workflow was disabled for inactivity,
 * any enable call failed, or no repo workflows were listed at all.
 * @param {{ listWorkflows: () => Promise<Array>, enableWorkflow: (id:number) => Promise<void> }} github
 */
export async function runKeepalive({ listWorkflows, enableWorkflow }) {
  const all = await listWorkflows();
  const { refresh, inactive, manual } = classifyWorkflows(all);

  const refreshed = [];
  const failed = [];
  for (const w of refresh) {
    try {
      await enableWorkflow(w.id);
      refreshed.push(w.name);
    } catch (err) {
      failed.push({ name: w.name, error: err.message });
    }
  }

  // Any inactive workflow already fails the run, so only refresh + manual decide "nothing listed".
  return {
    ok: inactive.length === 0 && failed.length === 0 && refresh.length + manual.length > 0,
    refreshed,
    inactive: inactive.map((w) => w.name),
    manual: manual.map((w) => w.name),
    failed,
  };
}

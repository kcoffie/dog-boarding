/**
 * Settings: the booking-site breaker (#324). Shows whether the app may contact the booking site,
 * and while it's blocked, why and since when, with the Clear button (POST /api/site-access).
 * @requirements REQ-657
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

async function readStatus() {
  const { res, body } = await callSiteAccess('GET');
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function callSiteAccess(method) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? '';
  const res = await fetch('/api/site-access', { method, headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SiteAccessCard() {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    readStatus()
      .then((body) => { if (live) { setStatus(body); setLoadError(''); } })
      .catch((err) => { if (live) setLoadError(err.message); });
    return () => { live = false; };
  }, [reloads]);

  const handleClear = async () => {
    setClearing(true);
    setClearResult(null);
    try {
      const { res, body } = await callSiteAccess('POST');
      setClearResult(res.ok
        ? { ok: true, text: 'Cleared and signed in to the booking site.' }
        : { ok: false, text: res.status === 502 ? `Cleared, but the sign-in failed: ${body.error}` : body.error || `HTTP ${res.status}` });
    } catch (err) {
      setClearResult({ ok: false, text: err.message });
    }
    setClearing(false);
    setReloads((n) => n + 1);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900">Booking site access</h2>
      {loadError && (
        <p className="text-sm text-red-600 mt-2">Couldn&apos;t read the booking-site status: {loadError}</p>
      )}
      {!loadError && !status && <p className="text-sm text-slate-400 mt-2">Loading...</p>}
      {status && !status.blocked && status.hasSession && (
        <p className="text-sm text-slate-600 mt-2">OK: the sync can reach the booking site.</p>
      )}
      {status && !status.blocked && !status.hasSession && (
        <p className="text-sm text-amber-700 mt-2">
          Not blocked, but there is no booking-site session yet. The sync waits for the nightly sign-in
          (5 PM Pacific).
        </p>
      )}
      {status?.blocked && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">
            Booking site blocked since {formatWhen(status.since)}: {status.reason}
          </p>
          <p className="text-sm text-red-700 mt-1">
            Nothing contacts the booking site until you press Clear, which signs in at once.
            If the login was refused, update the password in Vercel first.
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="mt-3 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {clearing ? 'Clearing...' : 'Clear'}
          </button>
        </div>
      )}
      {clearResult && (
        <p className={`text-sm mt-2 ${clearResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>{clearResult.text}</p>
      )}
    </div>
  );
}

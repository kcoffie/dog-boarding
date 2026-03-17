/**
 * Second daily detail-processing path.
 *
 * Re-exports the cron-detail handler so Vercel treats it as a distinct cron
 * path. The Hobby plan gives each path one run/day — a second path doubles
 * processing throughput at zero code complexity cost.
 *
 * Schedule: "15 0 * * *" (00:15 UTC) — 5 min after cron-detail (00:10 UTC).
 *
 * @requirements REQ-109
 */
export { default, config } from './cron-detail.js';

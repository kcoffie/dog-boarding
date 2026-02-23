/**
 * Shared logging utility for sync modules
 * Adds timestamps to all log messages
 * Also writes to file for Claude to monitor
 */

const LOG_ENDPOINT = '/api/log';

/**
 * Format timestamp for logging (HH:MM:SS)
 * @returns {string}
 */
export function getLogTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0]; // Returns "HH:MM:SS"
}

/**
 * Send log to file endpoint (fire and forget)
 */
function sendToFile(level, message, context = null) {
  if (!import.meta.env?.DEV) return;
  try {
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
      }),
    }).catch(() => {});
  } catch {
    // Ignore - logging should never break the app
  }
}

/**
 * Create a logger for a specific module
 * Logs to both console (with timestamp) and file
 * @param {string} prefix - Module prefix (e.g., 'Sync', 'Mapping')
 * @returns {Object} Logger object with log, error, warn methods
 */
export function createSyncLogger(prefix) {
  const formatMessage = (first, rest) => {
    const timestamp = getLogTimestamp();
    const fullPrefix = `[${prefix} ${timestamp}]`;

    if (typeof first === 'string' && first.startsWith(`[${prefix}]`)) {
      return [first.replace(`[${prefix}]`, fullPrefix), ...rest];
    }
    return [fullPrefix, first, ...rest];
  };

  const extractMessage = (first, rest) => {
    // Build a string message for file logging
    const parts = [first, ...rest].map(p => {
      if (typeof p === 'object') return JSON.stringify(p);
      return String(p);
    });
    return parts.join(' ');
  };

  return {
    log: (...args) => {
      const [first, ...rest] = args;
      console.log(...formatMessage(first, rest));
      sendToFile('info', `[${prefix}] ${extractMessage(first, rest)}`);
    },
    info: (...args) => {
      const [first, ...rest] = args;
      console.log(...formatMessage(first, rest));
      sendToFile('info', `[${prefix}] ${extractMessage(first, rest)}`);
    },
    error: (...args) => {
      const [first, ...rest] = args;
      console.error(...formatMessage(first, rest));
      sendToFile('error', `[${prefix}] ${extractMessage(first, rest)}`);
    },
    warn: (...args) => {
      const [first, ...rest] = args;
      console.warn(...formatMessage(first, rest));
      sendToFile('warn', `[${prefix}] ${extractMessage(first, rest)}`);
    },
    // Direct file-only logging for detailed context
    file: (message, context = null) => {
      sendToFile('info', `[${prefix}] ${message}`, context);
    },
  };
}

// Pre-created loggers for common modules
export const syncLogger = createSyncLogger('Sync');
export const mappingLogger = createSyncLogger('Mapping');
export const historicalLogger = createSyncLogger('Historical');
export const deletionLogger = createSyncLogger('Deletion');
export const batchLogger = createSyncLogger('Batch');

/**
 * Clear the log file
 */
export async function clearLogFile() {
  if (!import.meta.env?.DEV) return;
  try {
    await fetch('/api/log/clear', { method: 'POST' });
    console.log('[Logger] Log file cleared');
  } catch {
    // Ignore
  }
}

/**
 * Log a sync start marker (helps identify sync runs in log file)
 */
export function logSyncStart(type = 'manual') {
  const marker = '═'.repeat(50);
  sendToFile('info', marker);
  sendToFile('info', `SYNC STARTED - Type: ${type} - ${new Date().toISOString()}`);
  sendToFile('info', marker);
}

/**
 * Log a sync end marker
 */
export function logSyncEnd(result) {
  const marker = '═'.repeat(50);
  sendToFile('info', marker);
  sendToFile('info', `SYNC COMPLETED - Status: ${result.status}`, {
    found: result.appointmentsFound,
    created: result.appointmentsCreated,
    updated: result.appointmentsUpdated,
    unchanged: result.appointmentsUnchanged,
    failed: result.appointmentsFailed,
    durationMs: result.durationMs,
  });
  sendToFile('info', marker);
}

export default {
  getLogTimestamp,
  createSyncLogger,
  syncLogger,
  mappingLogger,
  historicalLogger,
  deletionLogger,
  batchLogger,
  clearLogFile,
  logSyncStart,
  logSyncEnd,
};

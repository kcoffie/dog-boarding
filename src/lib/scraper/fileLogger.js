/**
 * File-based logger for sync operations
 * Writes logs to disk via Vite dev server endpoint
 * Allows Claude to monitor sync progress by reading log files
 */

const LOG_ENDPOINT = '/api/log';

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * Send a log entry to the file logging endpoint
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 */
async function sendLog(level, message, context = null) {
  const timestamp = new Date().toISOString();

  // Also log to console for immediate visibility
  const consoleMethod = level === 'error' ? console.error :
                        level === 'warn' ? console.warn :
                        console.log;
  consoleMethod(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context || '');

  // Send to file endpoint (don't await - fire and forget to avoid blocking)
  if (!import.meta.env?.DEV) return;
  try {
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp,
        level,
        message,
        context,
      }),
    }).catch(() => {
      // Silently ignore logging failures - don't break the app
    });
  } catch {
    // Ignore errors - logging should never break the app
  }
}

/**
 * Log a debug message
 */
export function debug(message, context = null) {
  return sendLog(LogLevel.DEBUG, message, context);
}

/**
 * Log an info message
 */
export function info(message, context = null) {
  return sendLog(LogLevel.INFO, message, context);
}

/**
 * Log a warning message
 */
export function warn(message, context = null) {
  return sendLog(LogLevel.WARN, message, context);
}

/**
 * Log an error message
 */
export function error(message, context = null) {
  return sendLog(LogLevel.ERROR, message, context);
}

/**
 * Create a scoped logger with a prefix
 * @param {string} prefix - Prefix for all log messages (e.g., 'Sync', 'Mapping')
 * @returns {Object} Logger object with debug, info, warn, error methods
 */
export function createLogger(prefix) {
  const formatMessage = (msg) => `[${prefix}] ${msg}`;

  return {
    debug: (msg, ctx) => debug(formatMessage(msg), ctx),
    info: (msg, ctx) => info(formatMessage(msg), ctx),
    warn: (msg, ctx) => warn(formatMessage(msg), ctx),
    error: (msg, ctx) => error(formatMessage(msg), ctx),
  };
}

/**
 * Clear the log file
 */
export async function clearLog() {
  if (!import.meta.env?.DEV) return;
  try {
    await fetch('/api/log/clear', { method: 'POST' });
  } catch {
    // Ignore errors
  }
}

/**
 * Get recent log entries
 * @returns {Promise<string[]>} Array of log lines
 */
export async function getRecentLogs() {
  if (!import.meta.env?.DEV) return [];
  try {
    const response = await fetch('/api/log/tail');
    const data = await response.json();
    return data.lines || [];
  } catch {
    return [];
  }
}

// Pre-created loggers for common modules
export const syncLog = createLogger('Sync');
export const mappingLog = createLogger('Mapping');
export const authLog = createLogger('Auth');
export const batchLog = createLogger('Batch');

export default {
  LogLevel,
  debug,
  info,
  warn,
  error,
  createLogger,
  clearLog,
  getRecentLogs,
  syncLog,
  mappingLog,
  authLog,
  batchLog,
};

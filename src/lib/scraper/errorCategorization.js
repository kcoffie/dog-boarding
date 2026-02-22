/**
 * Error categorization module - categorizes sync errors for debugging
 * @requirements REQ-205.3, REQ-220
 */

/**
 * Error category enum
 */
export const ErrorCategory = {
  AUTH_ERROR: 'auth_error',
  NETWORK_ERROR: 'network_error',
  PARSE_ERROR: 'parse_error',
  SAVE_ERROR: 'save_error',
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

/**
 * Error category descriptions for user display
 */
export const ErrorCategoryDescriptions = {
  [ErrorCategory.AUTH_ERROR]: 'Authentication failed - check credentials',
  [ErrorCategory.NETWORK_ERROR]: 'Network error - check internet connection',
  [ErrorCategory.PARSE_ERROR]: 'Failed to parse data - site may have changed',
  [ErrorCategory.SAVE_ERROR]: 'Failed to save to database',
  [ErrorCategory.RATE_LIMIT]: 'Rate limited - too many requests',
  [ErrorCategory.TIMEOUT]: 'Request timed out',
  [ErrorCategory.UNKNOWN]: 'Unknown error occurred',
};

/**
 * Patterns for categorizing errors
 */
const ERROR_PATTERNS = [
  // Auth errors
  { pattern: /auth/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /login/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /credential/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /unauthorized/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /401/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /403/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /session\s*expired/i, category: ErrorCategory.AUTH_ERROR },
  { pattern: /invalid\s*token/i, category: ErrorCategory.AUTH_ERROR },

  // Network errors
  { pattern: /fetch/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /network/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /ECONNREFUSED/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /ENOTFOUND/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /failed\s*to\s*fetch/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /connection\s*refused/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /DNS/i, category: ErrorCategory.NETWORK_ERROR },
  { pattern: /socket/i, category: ErrorCategory.NETWORK_ERROR },

  // Rate limiting
  { pattern: /rate\s*limit/i, category: ErrorCategory.RATE_LIMIT },
  { pattern: /429/i, category: ErrorCategory.RATE_LIMIT },
  { pattern: /too\s*many\s*requests/i, category: ErrorCategory.RATE_LIMIT },
  { pattern: /throttl/i, category: ErrorCategory.RATE_LIMIT },

  // Timeout errors
  { pattern: /timeout/i, category: ErrorCategory.TIMEOUT },
  { pattern: /ETIMEDOUT/i, category: ErrorCategory.TIMEOUT },
  { pattern: /timed\s*out/i, category: ErrorCategory.TIMEOUT },
  { pattern: /aborted/i, category: ErrorCategory.TIMEOUT },

  // Parse errors
  { pattern: /parse/i, category: ErrorCategory.PARSE_ERROR },
  { pattern: /JSON/i, category: ErrorCategory.PARSE_ERROR },
  { pattern: /unexpected\s*token/i, category: ErrorCategory.PARSE_ERROR },
  { pattern: /invalid\s*HTML/i, category: ErrorCategory.PARSE_ERROR },
  { pattern: /selector/i, category: ErrorCategory.PARSE_ERROR },
  { pattern: /element\s*not\s*found/i, category: ErrorCategory.PARSE_ERROR },

  // Save/database errors
  { pattern: /supabase/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /database/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /duplicate\s*key/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /constraint/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /insert/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /update/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /PGRST/i, category: ErrorCategory.SAVE_ERROR },
  { pattern: /PostgreSQL/i, category: ErrorCategory.SAVE_ERROR },
];

/**
 * Categorize an error based on its message
 * @param {Error|string} error - Error object or message
 * @returns {string} Error category
 */
export function categorizeError(error) {
  const message = error instanceof Error ? error.message : String(error);

  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return category;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Get user-friendly description for an error category
 * @param {string} category - Error category
 * @returns {string} Human-readable description
 */
export function getErrorDescription(category) {
  return ErrorCategoryDescriptions[category] || ErrorCategoryDescriptions[ErrorCategory.UNKNOWN];
}

/**
 * Determine if an error is recoverable (worth retrying)
 * @param {string} category - Error category
 * @returns {boolean}
 */
export function isRecoverableError(category) {
  const recoverableCategories = [
    ErrorCategory.NETWORK_ERROR,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.TIMEOUT,
  ];
  return recoverableCategories.includes(category);
}

/**
 * Get recommended action for an error category
 * @param {string} category - Error category
 * @returns {string} Recommended action
 */
export function getRecommendedAction(category) {
  switch (category) {
    case ErrorCategory.AUTH_ERROR:
      return 'Check your external site credentials in settings';
    case ErrorCategory.NETWORK_ERROR:
      return 'Check your internet connection and try again';
    case ErrorCategory.PARSE_ERROR:
      return 'The external site may have changed. Contact support.';
    case ErrorCategory.SAVE_ERROR:
      return 'Database error. Try again or contact support.';
    case ErrorCategory.RATE_LIMIT:
      return 'Too many requests. Wait a few minutes and try again.';
    case ErrorCategory.TIMEOUT:
      return 'Request timed out. Check connection and try again.';
    default:
      return 'An unexpected error occurred. Try again or contact support.';
  }
}

/**
 * Analyze a batch of errors and return summary statistics
 * @param {Array<{error: string}>} errors - Array of error objects
 * @returns {Object} Error statistics by category
 */
export function analyzeErrors(errors) {
  const stats = {};

  for (const errorObj of errors) {
    const category = categorizeError(errorObj.error || errorObj);
    stats[category] = (stats[category] || 0) + 1;
  }

  // Find the most common error category
  let dominantCategory = ErrorCategory.UNKNOWN;
  let maxCount = 0;

  for (const [category, count] of Object.entries(stats)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = category;
    }
  }

  return {
    stats,
    dominantCategory,
    totalErrors: errors.length,
    isRecoverable: isRecoverableError(dominantCategory),
    recommendedAction: getRecommendedAction(dominantCategory),
  };
}

export default {
  ErrorCategory,
  ErrorCategoryDescriptions,
  categorizeError,
  getErrorDescription,
  isRecoverableError,
  getRecommendedAction,
  analyzeErrors,
};

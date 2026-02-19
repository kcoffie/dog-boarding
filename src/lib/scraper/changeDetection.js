/**
 * Change detection module - generates content hashes and detects changes
 * @requirements REQ-201.1, REQ-201.3
 */

/**
 * Fields used for generating content hash (per REQ-201.2)
 * These are the key fields that, if changed, indicate a meaningful update
 */
const HASH_FIELDS = [
  'check_in_datetime',
  'check_out_datetime',
  'status',
  'assigned_staff',
  'pet_name',
  'client_name',
  'client_phone',
  'special_notes',
];

/**
 * Generate a SHA-256 content hash from appointment data
 * Uses only the key fields that matter for change detection
 * @param {Object} appointment - Appointment data
 * @returns {Promise<string>} 64-character hex hash
 */
export async function generateContentHash(appointment) {
  // Build a string from the hash fields
  const data = HASH_FIELDS.map(field => {
    const value = appointment[field];
    // Normalize null/undefined to empty string
    if (value === null || value === undefined) return '';
    // Normalize dates to ISO strings
    if (value instanceof Date) return value.toISOString();
    // Convert everything else to string
    return String(value);
  }).join('|');

  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 64);
  } catch {
    // Fallback for environments without crypto.subtle (Node.js dev, etc.)
    // Simple hash function for development - not cryptographically secure
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0').substring(0, 64);
  }
}

/**
 * Synchronous version of content hash generation using simple hash
 * @param {Object} appointment - Appointment data
 * @returns {string} 64-character hex hash
 */
export function generateContentHashSync(appointment) {
  // Build a string from the hash fields
  const data = HASH_FIELDS.map(field => {
    const value = appointment[field];
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }).join('|');

  // DJB2 hash algorithm - simple and fast
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) + data.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to hex and pad to 64 chars
  const hashHex = Math.abs(hash).toString(16);
  return hashHex.padStart(64, '0').substring(0, 64);
}

/**
 * Detect changes between existing and incoming appointment data
 * @param {Object|null} existing - Existing record from database (or null if new)
 * @param {Object} incoming - New data from external source
 * @returns {Promise<Object>} Change detection result
 */
export async function detectChanges(existing, incoming) {
  const incomingHash = await generateContentHash(incoming);

  // New record
  if (!existing) {
    return {
      type: 'created',
      hash: incomingHash,
      previousData: null,
      changedFields: null,
    };
  }

  const existingHash = existing.content_hash;

  // Hash match - no changes
  if (existingHash === incomingHash) {
    return {
      type: 'unchanged',
      hash: incomingHash,
      previousData: null,
      changedFields: null,
    };
  }

  // Hash differs - extract what changed
  const changedFields = extractChangedFields(existing, incoming);

  return {
    type: 'updated',
    hash: incomingHash,
    previousData: extractPreviousData(existing, changedFields),
    changedFields,
  };
}

/**
 * Synchronous version of detectChanges
 * @param {Object|null} existing - Existing record from database
 * @param {Object} incoming - New data from external source
 * @returns {Object} Change detection result
 */
export function detectChangesSync(existing, incoming) {
  const incomingHash = generateContentHashSync(incoming);

  if (!existing) {
    return {
      type: 'created',
      hash: incomingHash,
      previousData: null,
      changedFields: null,
    };
  }

  const existingHash = existing.content_hash;

  if (existingHash === incomingHash) {
    return {
      type: 'unchanged',
      hash: incomingHash,
      previousData: null,
      changedFields: null,
    };
  }

  const changedFields = extractChangedFields(existing, incoming);

  return {
    type: 'updated',
    hash: incomingHash,
    previousData: extractPreviousData(existing, changedFields),
    changedFields,
  };
}

/**
 * Extract which fields changed between existing and incoming
 * @param {Object} existing - Existing record
 * @param {Object} incoming - Incoming data
 * @returns {Object} Object with field names as keys and {old, new} as values
 */
export function extractChangedFields(existing, incoming) {
  const changes = {};

  for (const field of HASH_FIELDS) {
    const oldValue = normalizeValue(existing[field]);
    const newValue = normalizeValue(incoming[field]);

    if (oldValue !== newValue) {
      changes[field] = {
        old: existing[field],
        new: incoming[field],
      };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Extract previous data for storage in previous_data column
 * @param {Object} existing - Existing record
 * @param {Object} changedFields - Fields that changed
 * @returns {Object} Previous data object
 */
function extractPreviousData(existing, changedFields) {
  if (!changedFields) return null;

  const previousData = {};
  for (const field of Object.keys(changedFields)) {
    previousData[field] = existing[field];
  }

  return previousData;
}

/**
 * Normalize a value for comparison
 * @param {any} value - Value to normalize
 * @returns {string} Normalized string value
 */
function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Get the list of fields used for hashing
 * @returns {string[]} Array of field names
 */
export function getHashFields() {
  return [...HASH_FIELDS];
}

export default {
  generateContentHash,
  generateContentHashSync,
  detectChanges,
  detectChangesSync,
  extractChangedFields,
  getHashFields,
};

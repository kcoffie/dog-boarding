/**
 * Shared HTML utility functions.
 *
 * Kept separate from scraper modules so both Node.js cron context and
 * browser/satori render context can import without pulling in scraper deps.
 */

/**
 * Decode common HTML character entities in a string.
 * The external site encodes pet names with &quot;, &#x27;, &amp;, etc.
 * Also applied at the display layer to handle stale DB rows stored before
 * entity decoding was added in the parse layer (PR #40).
 *
 * Error-handling: non-string / falsy input returns '' (defensive null guard).
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

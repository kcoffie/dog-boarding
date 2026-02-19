# Scraper Flakiness Diagnosis

## The Problems (Why It's Inconsistent)

### 🔴 Problem 1: Regex-Based HTML Parsing is Fragile
**Location:** `extraction.js` - `extractText()`, `selectorToRegex()`, all the regex patterns

**Why it fails:**
- Any tiny change in the HTML structure breaks the regex
- Whitespace variations (`class="foo bar"` vs `class="bar foo"`) break patterns
- Dynamic content (loaded after page renders) might not be there yet
- The regex patterns are too specific and brittle

**Example of fragility:**
```javascript
// This pattern looks for text inside an element with a specific class
new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]+)`, 'i')
```

If the HTML changes from:
```html
<div class="pet-name">Buddy</div>
```
to:
```html
<div class="pet-name" data-field="name">Buddy</div>
```

The regex still works. BUT if it changes to:
```html
<div class="pet-name">
  <span>Buddy</span>
</div>
```

The regex breaks because it expects text immediately after `>`, but there's whitespace/newlines.

### 🔴 Problem 2: No Wait for Dynamic Content
**Location:** `extraction.js` - `fetchAppointmentDetails()` and `schedule.js` - `fetchSchedulePage()`

**The issue:**
The code fetches HTML but doesn't wait for JavaScript to render content. If the external site uses JavaScript to load pet names, dates, or client info, you're grabbing the page before those values are populated.

**Result:** Inconsistent extraction - sometimes the data is there (lucky timing), sometimes it's not (page still loading).

### 🔴 Problem 3: Overly Generic Label Extraction
**Location:** `extraction.js` - `extractTextByLabel()`

```javascript
function extractTextByLabel(html, labelKeywords) {
  for (const keyword of labelKeywords) {
    const patterns = [
      new RegExp(`${keyword}[:\\s]*</[^>]+>\\s*([^<]+)`, 'i'),
      new RegExp(`${keyword}[:\\s]+([^<]+)`, 'i'),
      new RegExp(`>${keyword}</[^>]+>\\s*<[^>]+>([^<]+)`, 'i'),
    ];
```

This tries to match things like "special notes: some text" but:
- It's case-insensitive, so "Special Notes", "SPECIAL NOTES", "special_notes" all match
- The whitespace handling is inconsistent (`\s*` vs `\s+`)
- If there are multiple matches, it returns the first one (might be wrong field)
- If the label and value are in different sections of the DOM, it won't find it

### 🔴 Problem 4: No Error Handling or Logging for Parse Failures
**Location:** All extraction functions

There's no logging about *which* selector failed or why. So when extraction is flaky:
- You don't know which field is missing
- You don't know if it's the selector that broke or the HTML structure
- You don't know if it's a parsing error or a network error

### 🔴 Problem 5: Selector Configuration Might Be Wrong or Missing
**Location:** `src/lib/scraper/config.js` - the selectors

**The issue:** I can't see your config.js, but if the selectors don't match the actual HTML on the external site, nothing will extract correctly. And if the site changed its HTML structure, all the selectors become invalid.

---

## How to Fix It (Priority Order)

### Fix #1: Stop Using Regex, Use Proper HTML Parsing
**Why:** Modern HTML parsing is way more reliable than regex patterns.

**How:**
Use `jsdom` or `cheerio` (lightweight) instead of regex:

```javascript
// Instead of this:
const pattern = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]+)`, 'i');
const match = html.match(pattern);

// Do this:
import { JSDOM } from 'jsdom';
const dom = new JSDOM(html);
const element = dom.window.document.querySelector(`.${className}`);
const text = element?.textContent?.trim();
```

This is:
- More reliable (handles whitespace, nested elements, attributes in any order)
- More maintainable (uses standard CSS selectors)
- More debuggable (you can see what element you're selecting)

**Effort:** 2-3 hours to rewrite extraction.js with proper HTML parsing

---

### Fix #2: Add Explicit Waits for Dynamic Content
**Why:** If the site loads content with JavaScript, you need to wait for it.

**How:**
In `schedule.js` and `extraction.js`, after fetching HTML, check if critical fields are present. If not, retry:

```javascript
export async function fetchAppointmentDetails(appointmentId, timestamp = '') {
  const url = `${SCRAPER_CONFIG.baseUrl}/schedule/a/${appointmentId}/${timestamp}`;
  const response = await authenticatedFetch(url);
  const html = await response.text();
  
  // Check if critical fields are present
  const hasPetName = html.includes('pet') || html.includes('dog');
  const hasClientName = html.includes('client') || html.includes('owner');
  
  if (!hasPetName || !hasClientName) {
    // Maybe wait a bit and retry
    console.warn('[Extraction] Critical fields missing, retrying...');
    await delay(2000);
    return fetchAppointmentDetails(appointmentId, timestamp);
  }
  
  return parseAppointmentPage(html, url);
}
```

**Effort:** 1 hour

---

### Fix #3: Improve Label-Based Extraction
**Why:** Your current approach is too loose and matches wrong fields.

**How:**
Be more specific about context:

```javascript
function extractTextByLabel(html, labelKeywords, context = null) {
  // Find the section containing the label
  // Then extract text *only from that section*
  // Not from the whole HTML
  
  for (const keyword of labelKeywords) {
    // More specific pattern with better boundaries
    const pattern = new RegExp(
      `<(?:div|section|fieldset|form-group)[^>]*>` +
      `[^]*?` +
      `(?:${keyword})` +
      `[^]*?` +
      `>([^<]+)<`,
      'i'
    );
    
    const match = html.match(pattern);
    if (match && match[1]) {
      const text = cleanText(match[1]);
      if (text && text.length > 5) { // Sanity check: label is usually short
        return text;
      }
    }
  }
  return null;
}
```

**Effort:** 1 hour

---

### Fix #4: Add Comprehensive Logging to Extraction
**Why:** So you can see *what* failed and why.

**How:**
Log every extraction attempt:

```javascript
function extractText(html, selectorPattern) {
  if (!selectorPattern) {
    logDebug(`[Extract] No selector provided, skipping`);
    return null;
  }

  const selectors = selectorPattern.split(',').map(s => s.trim());
  
  for (const selector of selectors) {
    const pattern = selectorToRegex(selector);
    const match = html.match(pattern);
    
    if (match && match[1]) {
      logDebug(`[Extract] ✅ Matched selector "${selector}"`, { result: match[1] });
      return cleanText(match[1]);
    } else {
      logDebug(`[Extract] ❌ Failed selector "${selector}"`);
    }
  }

  logWarn(`[Extract] ⚠️ No selectors matched for pattern: ${selectorPattern}`);
  return null;
}
```

Now when extraction is flaky, you'll see which selectors are failing.

**Effort:** 30 minutes

---

## What You Actually Need to Show Me

Before I can help you fix this properly, I need to see:

1. **`src/lib/scraper/config.js`** — What are the actual selectors you're using?
2. **A sample of the external site's HTML** — Paste the HTML of:
   - The schedule/appointments list page
   - One appointment detail page
3. **What specifically was inconsistent** — When you ran the sync multiple times:
   - Were some appointments missing?
   - Were fields empty (null) sometimes but populated other times?
   - Did the same appointment extract differently on retry?

---

## Recommended Path Forward

1. **Show me the config and sample HTML** (15 min)
2. **I'll identify which selectors are wrong/brittle** (15 min)
3. **We'll rewrite extraction.js to use proper HTML parsing** (2-3 hours with Claude Code)
4. **Add comprehensive logging** (30 min)
5. **Test: run sync 5 times, verify same data every time** (1 hour)

**Total time to fix flakiness: ~4-5 hours**

Then you'll be confident moving to Priority 1 (file-based logging) and beyond.

---

## Why This Matters

Right now:
- You'll ship a feature to your partner that sometimes works, sometimes doesn't ✗
- When it fails, you won't know why ✗
- You can't debug it without seeing the HTML ✗

After fixing:
- Consistent, reliable extraction ✓
- Clear logs showing what extracted and what failed ✓
- Debuggable (you can see which selector failed) ✓
- Professional quality ✓

**Show me the config.js and sample HTML, and we'll fix this properly.**

/**
 * Tests for petIds extraction from schedule page HTML (REQ-500)
 */

import { describe, it, expect } from 'vitest';
import { parseSchedulePage } from '../../lib/scraper/schedule.js';

// Schedule page with event-pet-wrapper[data-pet] attributes — single pet
const SCHEDULE_WITH_PET_IDS = `
<!DOCTYPE html>
<html>
<body>
  <a class="day-event"
     href="/schedule/a/C63QfLnk/1739491200"
     data-event_type="1"
     data-status="1">
    <div class="day-event-time">Feb 13, 11am - Feb 17, 10am</div>
    <div class="day-event-title">2/13-17</div>
    <div class="event-pet-wrapper" data-pet="90043">
      <span class="event-pet pet-1">Lilly O'Brien</span>
    </div>
    <span class="event-client">Jane O'Brien</span>
  </a>
</body>
</html>
`;

// Schedule page with two pets (multi-pet appointment)
const SCHEDULE_MULTI_PET = `
<!DOCTYPE html>
<html>
<body>
  <a class="day-event"
     href="/schedule/a/MULTI123/1739491200"
     data-event_type="1"
     data-status="1">
    <div class="day-event-time">Feb 13, 11am - Feb 17, 10am</div>
    <div class="day-event-title">2/13-17</div>
    <div class="event-pet-wrapper" data-pet="90043">
      <span class="event-pet pet-1">Lilly</span>
    </div>
    <div class="event-pet-wrapper" data-pet="90053">
      <span class="event-pet pet-2">Buddy</span>
    </div>
    <span class="event-client">Jane O'Brien</span>
  </a>
</body>
</html>
`;

// Schedule page with no data-pet attributes (legacy/fallback)
const SCHEDULE_NO_PET_IDS = `
<!DOCTYPE html>
<html>
<body>
  <a class="day-event"
     href="/schedule/a/ABC123/1234567890"
     data-event_type="1"
     data-status="1">
    <div class="day-event-time">Dec 21, 5pm - Dec 23, 10am</div>
    <span class="event-pet pet-1">Luna Smith</span>
    <span class="event-client">John Smith</span>
  </a>
</body>
</html>
`;

describe('REQ-500: petIds extraction from schedule HTML', () => {
  it('extracts petIds from event-pet-wrapper[data-pet] elements', () => {
    const appointments = parseSchedulePage(SCHEDULE_WITH_PET_IDS);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].petIds).toEqual(['90043']);
  });

  it('extracts multiple petIds for multi-pet appointments', () => {
    const appointments = parseSchedulePage(SCHEDULE_MULTI_PET);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].petIds).toEqual(['90043', '90053']);
  });

  it('returns empty petIds array when no event-pet-wrapper elements present', () => {
    const appointments = parseSchedulePage(SCHEDULE_NO_PET_IDS);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].petIds).toEqual([]);
  });

  it('first petId is the primary pet', () => {
    const appointments = parseSchedulePage(SCHEDULE_MULTI_PET);
    expect(appointments[0].petIds[0]).toBe('90043');
  });
});

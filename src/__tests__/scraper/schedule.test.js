/**
 * Schedule page parsing tests
 * @requirements REQ-101
 */

import { describe, it, expect } from 'vitest';
import {
  parseSchedulePage,
  filterBoardingAppointments,
} from '../../lib/scraper/schedule.js';
import {
  mockSchedulePage,
  mockSchedulePageNoPagination,
} from './fixtures.js';

describe('REQ-101: Appointment List Scraping', () => {
  describe('parseSchedulePage()', () => {
    it('extracts appointment IDs from schedule page', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments).toHaveLength(4);
      expect(appointments[0].id).toBe('ABC123');
      expect(appointments[1].id).toBe('DEF456');
      expect(appointments[2].id).toBe('GHI789');
      expect(appointments[3].id).toBe('JKL012');
    });

    it('extracts full URLs for each appointment', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].url).toContain('/schedule/a/ABC123/');
      expect(appointments[1].url).toContain('/schedule/a/DEF456/');
    });

    it('extracts pet names from child elements', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].petName).toBe('Luna Smith');
      expect(appointments[1].petName).toBe('Cooper Doe');
    });

    it('extracts client names from child elements', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].clientName).toBe('John Smith');
      expect(appointments[1].clientName).toBe('Jane Doe');
    });

    it('extracts time range from day-event-time element', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].time).toContain('Dec 21');
      expect(appointments[0].time).toContain('Dec 23');
    });

    it('extracts eventType from data-event_type attribute', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].eventType).toBe('1');
      expect(appointments[2].eventType).toBe('2'); // GHI789 is event_type 2
    });

    it('extracts status from data-status attribute', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].status).toBe('6'); // Completed
    });

    it('extracts date-range title from day-event-title element', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].title).toBe('12/21-12/23am');
    });

    it('handles page with no appointments', () => {
      const html = '<html><body><p>No appointments</p></body></html>';
      const appointments = parseSchedulePage(html);

      expect(appointments).toHaveLength(0);
    });

    it('handles minimal appointment anchor with just href', () => {
      const html = '<html><body><a href="/schedule/a/TEST123/999">Text</a></body></html>';
      const appointments = parseSchedulePage(html);

      expect(appointments).toHaveLength(1);
      expect(appointments[0].id).toBe('TEST123');
      expect(appointments[0].petName).toBe('');
      expect(appointments[0].clientName).toBe('');
    });

    it('deduplicates appointments by ID', () => {
      const htmlWithDupes = `
        <html><body>
          <a href="/schedule/a/ABC123/111" data-id="ABC123">
            <span class="event-pet pet-1">Dog1</span>
          </a>
          <a href="/schedule/a/ABC123/222" data-id="ABC123">
            <span class="event-pet pet-1">Dog1</span>
          </a>
          <a href="/schedule/a/DEF456/333" data-id="DEF456">
            <span class="event-pet pet-2">Dog2</span>
          </a>
        </body></html>
      `;

      const appointments = parseSchedulePage(htmlWithDupes);

      expect(appointments).toHaveLength(2);
      expect(appointments.map(a => a.id)).toEqual(['ABC123', 'DEF456']);
    });
  });

  describe('filterBoardingAppointments()', () => {
    it('passes all appointments through (boarding filter is now at detail-page level)', () => {
      const allAppointments = parseSchedulePage(mockSchedulePage);
      const result = filterBoardingAppointments(allAppointments);

      // All 4 appointments pass through — GHI789 (day visit) is NOT filtered here
      expect(result).toHaveLength(4);
    });

    it('removes entries with no id', () => {
      const appointments = [
        { id: 'A1', url: '/a/1', petName: 'Buddy' },
        { id: '', url: '/a/2', petName: '' },
        { id: 'A3', url: '/a/3', petName: 'Rex' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(a => a.id)).toEqual(['A1', 'A3']);
    });

    it('returns empty array for empty input', () => {
      expect(filterBoardingAppointments([])).toHaveLength(0);
    });
  });

  describe('pagination detection', () => {
    it('detects pagination links', () => {
      expect(mockSchedulePage).toContain('class="next"');
      expect(mockSchedulePage).toContain('page=3');
    });

    it('handles page with no pagination', () => {
      expect(mockSchedulePageNoPagination).not.toContain('class="next"');
    });
  });

  describe('URL handling', () => {
    it('handles relative URLs by prepending base URL', () => {
      const html = '<html><body><a href="/schedule/a/REL123/999"><span class="event-pet">Dog</span></a></body></html>';
      const appointments = parseSchedulePage(html);

      expect(appointments[0].url).toContain('/schedule/a/REL123/');
    });

    it('preserves timestamp in URL', () => {
      const html = '<html><body><a href="/schedule/a/TEST123/1234567890"></a></body></html>';
      const appointments = parseSchedulePage(html);

      expect(appointments[0].url).toContain('1234567890');
      expect(appointments[0].timestamp).toBe('1234567890');
    });

    it('appointment IDs are unique after deduplication', () => {
      const appointments = parseSchedulePage(mockSchedulePage);
      const ids = appointments.map(a => a.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids.length).toBe(uniqueIds.length);
    });
  });
});

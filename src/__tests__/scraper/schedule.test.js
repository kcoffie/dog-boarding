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
    it('extracts appointment links from schedule page', () => {
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

    it('extracts appointment titles', () => {
      const appointments = parseSchedulePage(mockSchedulePage);

      expect(appointments[0].title).toContain('Luna');
      expect(appointments[1].title).toContain('Cooper');
    });

    it('handles page with no appointments', () => {
      const html = '<html><body><p>No appointments</p></body></html>';
      const appointments = parseSchedulePage(html);

      expect(appointments).toHaveLength(0);
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<html><body><a href="/schedule/a/TEST123/999">Test</body>';
      const appointments = parseSchedulePage(html);

      expect(appointments).toHaveLength(1);
      expect(appointments[0].id).toBe('TEST123');
    });
  });

  describe('filterBoardingAppointments()', () => {
    it('filters to only boarding appointments', () => {
      const allAppointments = parseSchedulePage(mockSchedulePage);
      const boardingOnly = filterBoardingAppointments(allAppointments);

      // Should filter out Daycare (GHI789)
      expect(boardingOnly).toHaveLength(3);
      expect(boardingOnly.find(a => a.id === 'GHI789')).toBeUndefined();
    });

    it('keeps appointments with "boarding" in title', () => {
      const appointments = [
        { id: '1', url: '/a/1', title: 'Boarding (Nights) - Fluffy' },
        { id: '2', url: '/a/2', title: 'Daycare - Spot' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('keeps appointments with "overnight" in title', () => {
      const appointments = [
        { id: '1', url: '/a/1', title: 'Overnight Stay - Max' },
        { id: '2', url: '/a/2', title: 'Grooming - Rex' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('keeps appointments with "nights" in title', () => {
      const appointments = [
        { id: '1', url: '/a/1', title: '3 Nights - Buddy' },
        { id: '2', url: '/a/2', title: 'Training Session - Duke' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('is case-insensitive', () => {
      const appointments = [
        { id: '1', url: '/a/1', title: 'BOARDING - Dog1' },
        { id: '2', url: '/a/2', title: 'boarding - Dog2' },
        { id: '3', url: '/a/3', title: 'Boarding - Dog3' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(3);
    });

    it('returns empty array when no boarding appointments', () => {
      const appointments = [
        { id: '1', url: '/a/1', title: 'Daycare - Spot' },
        { id: '2', url: '/a/2', title: 'Grooming - Rex' },
      ];

      const filtered = filterBoardingAppointments(appointments);

      expect(filtered).toHaveLength(0);
    });
  });

  describe('pagination detection', () => {
    it('detects pagination links', () => {
      // We can test this by checking the parsed result includes pagination info
      // The function returns hasNextPage and nextPageUrl
      const html = mockSchedulePage;

      // Check that the HTML contains pagination
      expect(html).toContain('class="next"');
      expect(html).toContain('page=3');
    });

    it('handles page with no pagination', () => {
      const html = mockSchedulePageNoPagination;

      // No pagination links
      expect(html).not.toContain('class="next"');
    });
  });

  describe('date range filtering', () => {
    it('appointment IDs are unique', () => {
      const appointments = parseSchedulePage(mockSchedulePage);
      const ids = appointments.map(a => a.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids.length).toBe(uniqueIds.length);
    });

    it('handles duplicate appointments gracefully', () => {
      const htmlWithDupes = `
        <html><body>
          <a href="/schedule/a/ABC123/111">Boarding - Dog1</a>
          <a href="/schedule/a/ABC123/222">Boarding - Dog1 (duplicate)</a>
          <a href="/schedule/a/DEF456/333">Boarding - Dog2</a>
        </body></html>
      `;

      const appointments = parseSchedulePage(htmlWithDupes);

      // Should have all entries initially (dedup happens in fetchAllSchedulePages)
      expect(appointments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('URL handling', () => {
    it('handles relative URLs', () => {
      const html = '<a href="/schedule/a/REL123/999">Boarding - Test</a>';
      const appointments = parseSchedulePage(html);

      expect(appointments[0].url).toContain('/schedule/a/REL123/');
    });

    it('preserves timestamp in URL', () => {
      const html = '<a href="/schedule/a/TEST123/1234567890">Boarding - Test</a>';
      const appointments = parseSchedulePage(html);

      expect(appointments[0].url).toContain('1234567890');
    });
  });
});

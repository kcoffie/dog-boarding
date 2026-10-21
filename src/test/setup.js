import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { SCRAPER_CONFIG } from '../lib/scraper/config.js';

// Booking-site requests are paced 1.5 s apart (#324). Tests don't wait; the pacing tests in
// auth.test.js set the gap back themselves.
SCRAPER_CONFIG.delayBetweenRequests = 0;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
// Node-environment tests (// @vitest-environment node) have no window.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
}

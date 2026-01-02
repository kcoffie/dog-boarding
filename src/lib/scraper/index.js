/**
 * External site scraper module
 * @requirements REQ-100, REQ-101, REQ-102, REQ-103
 */

export { SCRAPER_CONFIG } from './config.js';
export {
  authenticate,
  getSessionCookies,
  isAuthenticated,
  clearSession,
  setSession,
  authenticatedFetch,
} from './auth.js';
export {
  parseSchedulePage,
  filterBoardingAppointments,
  fetchSchedulePage,
  fetchAllSchedulePages,
} from './schedule.js';
export {
  parseAppointmentPage,
  fetchAppointmentDetails,
} from './extraction.js';
export {
  mapToDog,
  mapToBoarding,
  mapToSyncAppointment,
  findDogByExternalId,
  findDogByName,
  findBoardingByExternalId,
  upsertDog,
  upsertBoarding,
  upsertSyncAppointment,
  mapAndSaveAppointment,
  mapAndSaveAppointments,
} from './mapping.js';
export {
  SyncStatus,
  createSyncLog,
  updateSyncLog,
  getSyncSettings,
  updateSyncSettings,
  runSync,
  getRecentSyncLogs,
  isSyncRunning,
  abortStuckSync,
} from './sync.js';

# Sync Feature - Additional Tasks

## Logging Improvements
- [x] Add timestamp to all `[Sync]` console log messages
  - Format: `[Sync HH:MM:SS]` (e.g., `[Sync 12:16:32]`)
  - Applied to: sync.js, mapping.js, historicalSync.js, deletionDetection.js
  - Implemented: Created `src/lib/scraper/logger.js` with shared timestamped loggers

## Persistent Logging
- [ ] Write sync logs to local storage or IndexedDB
- [ ] Include timestamp, level (info/warn/error), message, and context
- [ ] Implement rolling deletion (e.g., keep last 1000 entries or last 7 days)
- [ ] Add UI to view/export local logs for debugging
- [ ] Consider: downloadable log file for support tickets

const isDev = import.meta.env.DEV;

const isEnabled = () => {
  if (isDev) return true;
  try {
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
};

const styles = {
  dog: 'color: #f59e0b; font-weight: bold',
  boarding: 'color: #6366f1; font-weight: bold',
  settings: 'color: #10b981; font-weight: bold',
  data: 'color: #64748b',
  auth: 'color: #ef4444; font-weight: bold',
  error: 'color: #dc2626; font-weight: bold; background: #fef2f2; padding: 2px 6px; border-radius: 3px',
};

export const logger = {
  enable() {
    localStorage.setItem('debug', 'true');
    console.log('%c🔧 Logging enabled', 'color: #f59e0b; font-weight: bold');
  },

  disable() {
    localStorage.removeItem('debug');
    console.log('%c🔧 Logging disabled', 'color: #64748b');
  },

  dog(action, data) {
    if (!isEnabled()) return;
    console.log(`%c🐕 ${action}`, styles.dog, data);
  },

  boarding(action, data) {
    if (!isEnabled()) return;
    console.log(`%c📅 ${action}`, styles.boarding, data);
  },

  settings(action, data) {
    if (!isEnabled()) return;
    console.log(`%c⚙️ ${action}`, styles.settings, data);
  },

  data(action, data) {
    if (!isEnabled()) return;
    console.log(`%c💾 ${action}`, styles.data, data);
  },

  auth(action, data) {
    if (!isEnabled()) return;
    console.log(`%c🔐 ${action}`, styles.auth, data);
  },

  error(action, error) {
    // Always log errors, even if logging is disabled
    console.error(`%c❌ ${action}`, styles.error, error);
  },
};

// Expose logger globally for console access in production
if (typeof window !== 'undefined') {
  window.logger = logger;
}

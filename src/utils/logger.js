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
  boarding: 'color: #6366f1; font-weight: bold',
  settings: 'color: #10b981; font-weight: bold',
  data: 'color: #64748b',
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
};

// Expose logger globally for console access in production
if (typeof window !== 'undefined') {
  window.logger = logger;
}

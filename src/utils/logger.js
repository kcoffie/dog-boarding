const isDev = import.meta.env.DEV;

const styles = {
  dog: 'color: #f59e0b; font-weight: bold',
  boarding: 'color: #6366f1; font-weight: bold',
  settings: 'color: #10b981; font-weight: bold',
  data: 'color: #64748b',
};

export const logger = {
  dog(action, data) {
    if (!isDev) return;
    console.log(`%c🐕 ${action}`, styles.dog, data);
  },

  boarding(action, data) {
    if (!isDev) return;
    console.log(`%c📅 ${action}`, styles.boarding, data);
  },

  settings(action, data) {
    if (!isDev) return;
    console.log(`%c⚙️ ${action}`, styles.settings, data);
  },

  data(action, data) {
    if (!isDev) return;
    console.log(`%c💾 ${action}`, styles.data, data);
  },
};

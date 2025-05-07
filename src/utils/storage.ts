export const isBrowser = () => typeof window !== 'undefined';

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (isBrowser()) {
        return localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.warn(`Error accessing localStorage for key ${key}:`, error);
      return null;
    }
  },

  setItem: (key: string, value: string): void => {
    try {
      if (isBrowser()) {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.warn(`Error setting localStorage for key ${key}:`, error);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (isBrowser()) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Error removing localStorage for key ${key}:`, error);
    }
  }
};

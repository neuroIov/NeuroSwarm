/**
 * Custom logger utility to control console output based on environment
 * Prevents sensitive information from being exposed in production
 */

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

// Check if we're in a test environment that needs logs
const isTest = sessionStorage.getItem('enableTestLogs') === 'true';

// Only log in development or when explicitly enabled for testing
const shouldLog = isDev || isTest;

/**
 * Custom logger that only outputs in development environment
 */
export const logger = {
  /**
   * Log information messages (only in development)
   */
  log: (...args: any[]): void => {
    if (shouldLog) console.log(...args);
  },

  /**
   * Log error messages (only in development)
   * In production, errors are silently suppressed from the console
   */
  error: (...args: any[]): void => {
    if (shouldLog) console.error(...args);
  },

  /**
   * Log warning messages (only in development)
   */
  warn: (...args: any[]): void => {
    if (shouldLog) console.warn(...args);
  },

  /**
   * Log debug messages (only in development)
   */
  debug: (...args: any[]): void => {
    if (shouldLog) console.debug(...args);
  },

  /**
   * Log info messages (only in development)
   */
  info: (...args: any[]): void => {
    if (shouldLog) console.info(...args);
  },

  /**
   * Safely log non-sensitive information even in production
   * Use this only for information that is safe to expose to users
   */
  safe: (...args: any[]): void => {
    console.log(...args);
  }
};

/**
 * Utility to mask sensitive information in strings
 * @param text Text that may contain sensitive information
 * @param pattern Regular expression to match sensitive parts
 * @param maskChar Character to use for masking
 * @returns Masked string
 */
export const maskSensitiveInfo = (
  text: string, 
  pattern: RegExp = /(api|key|secret|password|token|auth)[:=]\s*["']?([^"'\s]+)["']?/gi,
  maskChar: string = '*****'
): string => {
  return text.replace(pattern, (_match, prefix) => {
    return `${prefix}:${maskChar}`;
  });
};

export default logger;

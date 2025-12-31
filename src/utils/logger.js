// Enable or disable debug logging
const DEBUG = true;

/**
 * WebRTC logger for client-side logging
 */
export const webrtcLogger = {
  /**
   * Log a message to the console
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  log: (message, ...args) => {
    if (DEBUG) {
      console.log(`[WebRTC] ${message}`, ...args);
    }
  },

  /**
   * Log an error message to the console
   * @param {string} message - The error message to log
   * @param {...any} args - Additional arguments to log
   */
  error: (message, ...args) => {
    console.error(`[WebRTC] ${message}`, ...args);
  },

  /**
   * Log a warning message to the console
   * @param {string} message - The warning message to log
   * @param {...any} args - Additional arguments to log
   */
  warn: (message, ...args) => {
    console.warn(`[WebRTC] ${message}`, ...args);
  },

  /**
   * Log a message to localStorage for persistence
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  persistLog: (message, ...args) => {
    if (typeof window !== "undefined" && window.localStorage) {
      const logs = JSON.parse(localStorage.getItem("webrtcLogs") || "[]");
      logs.push({
        timestamp: new Date().toISOString(),
        message,
        args: args.map((arg) => {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }),
      });
      // Keep only the last 100 logs
      if (logs.length > 100) {
        logs.shift();
      }
      localStorage.setItem("webrtcLogs", JSON.stringify(logs));
    }
    webrtcLogger.log(message, ...args);
  },
};

/**
 * Helper to view logs from localStorage
 * @returns {Array} The logs from localStorage
 */
export const viewWebRTCLogs = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    return JSON.parse(localStorage.getItem("webrtcLogs") || "[]");
  }
  return [];
};

/**
 * Helper to clear logs from localStorage
 */
export const clearWebRTCLogs = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem("webrtcLogs");
  }
};

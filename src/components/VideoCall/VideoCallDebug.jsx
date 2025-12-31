"use client";

import React, { useState } from "react";
import { viewWebRTCLogs, clearWebRTCLogs } from "../../utils/logger";
import styles from "./styles.module.css";

/**
 * Debug component for WebRTC video calls
 * Displays logs and provides controls for debugging
 */
export default function VideoCallDebug() {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("");

  /**
   * Load and display logs from localStorage
   */
  const handleViewLogs = () => {
    setLogs(viewWebRTCLogs());
    setShowLogs(true);
  };

  /**
   * Clear logs from localStorage
   */
  const handleClearLogs = () => {
    clearWebRTCLogs();
    setLogs([]);
  };

  /**
   * Filter logs based on search term
   */
  const filteredLogs = logs.filter(
    (log) =>
      filter === "" ||
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      log.args.some((arg) => arg.toLowerCase().includes(filter.toLowerCase()))
  );

  // Only show the debug button in development mode
  if (process.env.NODE_ENV === "production" && !showLogs) {
    return null;
  }

  if (!showLogs) {
    return (
      <div className={styles.debugButton}>
        <button onClick={handleViewLogs}>Debug</button>
      </div>
    );
  }

  return (
    <div className={styles.debugPanel}>
      <div className={styles.debugHeader}>
        <h3>WebRTC Debug Logs</h3>
        <div className={styles.debugControls}>
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.debugFilter}
          />
          <button
            onClick={() => setShowLogs(false)}
            className={styles.debugClose}
          >
            Close
          </button>
          <button onClick={handleClearLogs} className={styles.debugClear}>
            Clear Logs
          </button>
        </div>
      </div>
      <div className={styles.debugContent}>
        {filteredLogs.length === 0 ? (
          <p>No logs available</p>
        ) : (
          <ul className={styles.logList}>
            {filteredLogs.map((log, index) => (
              <li key={index} className={styles.logItem}>
                <span className={styles.timestamp}>{log.timestamp}</span>
                <span className={styles.message}>{log.message}</span>
                {log.args.map((arg, i) => (
                  <pre key={i} className={styles.logArgs}>
                    {arg}
                  </pre>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

export default function AudioLevelIndicator({ stream, isLocal = false }) {
  const [audioLevel, setAudioLevel] = useState(0);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateAudioLevel = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = Math.min(average / 128, 1); // Normalize to 0-1

        setAudioLevel(normalizedLevel);
      }

      animationRef.current = requestAnimationFrame(updateAudioLevel);
    };

    updateAudioLevel();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [stream]);

  const getBars = () => {
    const bars = [];
    const barCount = 5;

    for (let i = 0; i < barCount; i++) {
      const threshold = (i + 1) / barCount;
      const isActive = audioLevel > threshold;

      bars.push(
        <div
          key={i}
          className={`${styles.bar} ${isActive ? styles.active : ""}`}
          style={{
            height: `${20 + i * 8}px`,
            backgroundColor: isActive
              ? `hsl(${120 - i * 30}, 70%, 50%)` // Green to red gradient
              : "#333",
          }}
        />
      );
    }

    return bars;
  };

  if (!stream) return null;

  return (
    <div
      className={`${styles.audioIndicator} ${
        isLocal ? styles.local : styles.remote
      }`}
    >
      <div className={styles.bars}>{getBars()}</div>
      <span className={styles.label}>{isLocal ? "🎤" : "🔊"}</span>
    </div>
  );
}

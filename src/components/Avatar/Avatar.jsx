"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import styles from "./Avatar.module.css";
import { assetUrl } from "@/services/apiConfig";

const Avatar = memo(({ src, name, size = 50, className = "" }) => {
  const getInitials = (name) => {
    if (!name) return "?";
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  };

  const getBackgroundColor = (name) => {
    if (!name) return "#9CA3AF";

    const colors = [
      "#EF4444",
      "#F97316",
      "#F59E0B",
      "#EAB308",
      "#84CC16",
      "#22C55E",
      "#10B981",
      "#14B8A6",
      "#06B6D4",
      "#0EA5E9",
      "#3B82F6",
      "#6366F1",
      "#8B5CF6",
      "#A855F7",
      "#D946EF",
      "#EC4899",
      "#F43F5E",
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  const getImageUrl = (src) => {
    return assetUrl(src);
  };

  const initials = useMemo(() => getInitials(name), [name]);
  const backgroundColor = useMemo(() => getBackgroundColor(name), [name]);
  const imageUrl = useMemo(() => getImageUrl(src), [src]);

  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={name || "Avatar"}
          width={size}
          height={size}
          className={styles.avatarImage}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className={styles.avatarFallback}
          style={{
            width: size,
            height: size,
            backgroundColor,
            fontSize: size * 0.4,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
});

Avatar.displayName = "Avatar";

export default Avatar;

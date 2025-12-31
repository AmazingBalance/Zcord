"use client";

import React from "react";
import Image from "next/image";
import styles from "./styles.module.css";
import call_icon from "@/../public/call_icon.svg";

export default function CallButton({
  onClick,
  isActive = false,
  disabled = false,
}) {
  return (
    <button
      className={`${styles.callButton} ${isActive ? styles.active : ""} ${
        disabled ? styles.disabled : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      title="Начать звонок"
    >
      <Image src={call_icon} alt="Звонок" width={24} height={24} />
    </button>
  );
}

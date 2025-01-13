"use client";

import React from "react";
import { useSelector, useDispatch } from "react-redux";

import Image from "next/image";

import styles from "./styles.module.css";

export default function InfoZone() {
    const news = useSelector((state) => state.user);

    return <div className={styles.FriendsZone}></div>;
}

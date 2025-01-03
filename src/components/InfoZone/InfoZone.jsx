"use client";

import React from "react";
import { useSelector, useDispatch } from "react-redux";

import Image from "next/image";

import styles from "./styles.module.css";

export default function InfoZone() {
    const news = useSelector((state) => state.news.value);

    return (
        <div className={styles.InfoZone}>
            {news.map((news_item) => (
                <div key={news_item.id} className={styles.newBlock}>
                    <div className={styles.newBlock_versionBlock}>
                        {news_item.version}
                    </div>
                    <Image
                        alt=""
                        width={400}
                        height={225}
                        src={news_item.imageSrc}
                        className={styles.newBlock_image}
                    />
                    <h2 className={styles.newBlock_title}>{news_item.title}</h2>
                    <p className={styles.newBlock_text}>{news_item.text}</p>
                </div>
            ))}
        </div>
    );
}

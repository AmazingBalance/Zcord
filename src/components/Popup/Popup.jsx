"use client";

import { useRef, useEffect } from "react";
import styles from "./styles.module.css";

export default function Popup({ children, showed, setShowed, popupRef }) {
    useEffect(() => {
        function handleClickOutside(event) {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setShowed(false);
            }
        }

        if (showed) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showed, setShowed]);

    return (
        <>
            {showed && (
                <div className={styles.Popup}>
                    <div
                        className={styles.PopupContent}
                        style={{
                            height: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        {children}
                    </div>
                </div>
            )}
        </>
    );
}

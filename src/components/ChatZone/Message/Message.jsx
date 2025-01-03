import React from "react";

import Image from "next/image";

import styles from "./styles.module.css";

import classNames from "classnames";

export default function Message({
    type,
    text,
    userName,
    userAvatar,
    imageSrc,
    active,
}) {
    return (
        <>
            {type === "system" ? (
                <div className={styles.SystemMessage}>{text}</div>
            ) : type === "user" ? (
                <div
                    className={classNames(
                        styles.UserMessage,
                        active ? styles.UserMessageCurrent : ""
                    )}
                >
                    <h3 className={styles.UserMessage_UserName}>{userName}</h3>
                    {imageSrc ? (
                        <Image
                            alt=""
                            src={imageSrc}
                            width={200}
                            height={113}
                            className={styles.UserMessage_Image}
                        />
                    ) : (
                        <></>
                    )}
                    <p className={styles.UserMessage_Text}>{text}</p>
                </div>
            ) : (
                <></>
            )}
        </>
    );
}

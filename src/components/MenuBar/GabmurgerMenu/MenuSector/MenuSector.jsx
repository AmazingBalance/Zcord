import styles from "./styles.module.css";

import Image from "next/image";
import Link from "next/link";

export default function MenuSector({
    text,
    imageSrc,
    linkHref,
    imageReverse,
    type,
    handleClick,
}) {
    return (
        <>
            {type !== "function" ? (
                <Link href={linkHref}>
                    <div className={styles.MenuSector}>
                        <Image
                            src={imageSrc}
                            alt={text}
                            width={30}
                            height={30}
                            style={{
                                transform: imageReverse ? "rotate(180deg)" : "",
                            }}
                        />
                        <p>{text}</p>
                    </div>
                </Link>
            ) : (
                <div
                    className={styles.MenuSector}
                    onClick={() => handleClick()}
                >
                    <Image
                        src={imageSrc}
                        alt={text}
                        width={30}
                        height={30}
                        style={{
                            transform: imageReverse ? "rotate(180deg)" : "",
                        }}
                    />
                    <p>{text}</p>
                </div>
            )}
        </>
    );
}

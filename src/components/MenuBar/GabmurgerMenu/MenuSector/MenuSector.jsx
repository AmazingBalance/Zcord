import styles from "./styles.module.css";

import Image from "next/image";
import Link from "next/link";

export default function MenuSector({ text, imageSrc, linkHref }) {
    return (
        <Link href={linkHref}>
            <div className={styles.MenuSector}>
                <Image src={imageSrc} alt={text} width={30} height={30} />
                <p>{text}</p>
            </div>
        </Link>
    );
}

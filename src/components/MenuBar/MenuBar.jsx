import styles from "./styles.module.css";
import GamburgerMenu from "./GabmurgerMenu/GamburgerMenu";

export default function MenuBar() {
    return (
        <header className={styles.MenuBar}>
            <GamburgerMenu />
        </header>
    );
}

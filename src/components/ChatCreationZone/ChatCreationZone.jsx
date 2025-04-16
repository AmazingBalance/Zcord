import styles from "./styles.module.css";
import Image from "next/image";
import edit_icon from "@/../public/edit_icon.png";
import default_avatar from "@/../public/default_avatar.jpg";
import { useState, useEffect } from "react";

export default function ChatCreationZone({ type }) {
    const [inputData, setInputData] = useState({
        name: "",
        tag: "",
        description: "",
    });
    const [logo, setLogo] = useState(null); // Добавляем состояние для логотипа

    // Функция для обработки загруженного файла
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogo(reader.result); // Сохраняем загруженное изображение в состояние
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className={styles.ChatCreationZone}>
            <h1>{type === "chat" ? "Создание чата" : "Создание канала"}</h1>

            <div className={styles.ChatCreationZone_MainInfo}>
                <div className={styles.ChatCreationZone_MainInfo_LogoContainer}>
                    <input
                        type="file"
                        id="avatar"
                        accept="image/*"
                        className={styles.ChatCreationZone_MainInfo_Logo_Input}
                        onChange={handleFileChange} // Обработка изменения файла
                    />
                    <label
                        htmlFor="avatar"
                        className={styles.ChatCreationZone_MainInfo_Logo_Label}
                    >
                        <Image
                            src={edit_icon}
                            alt="Изменить аватар"
                            width={48}
                            height={48}
                            className={
                                styles.ChatCreationZone_MainInfo_Logo_ChangeIcon
                            }
                        />
                    </label>
                    <Image
                        src={logo || default_avatar} // Используем либо загруженное изображение, либо изображение по умолчанию
                        alt="Аватар"
                        width={150}
                        height={150}
                        className={styles.ChatCreationZone_MainInfo_Logo}
                    />
                </div>
                <div
                    className={styles.ChatCreationZone_MainInfo_InputsContainer}
                >
                    <input
                        placeholder="Название"
                        type="text"
                        value={inputData.name}
                        onChange={(e) => {
                            e.preventDefault();
                            setInputData({
                                ...inputData,
                                name: e.target.value.substring(0, 30),
                            });
                        }}
                    />
                    <input
                        placeholder="Тег"
                        type="text"
                        value={inputData.tag}
                        onChange={(e) => {
                            e.preventDefault();
                            const value = e.target.value;
                            const filteredValue = value
                                .replace(" ", "_")
                                .toLowerCase()
                                .replace(/[^a-zа-я0-9-_]/g, "")
                                .substring(0, 22);
                            setInputData({
                                ...inputData,
                                tag: filteredValue,
                            });
                        }}
                    />
                </div>
            </div>
            <textarea
                className={styles.ChatCreationZone_MainInfo_Description}
                placeholder="Описание"
                value={inputData.description || ""}
                onChange={(e) => {
                    e.preventDefault();
                    setInputData({
                        ...inputData,
                        description: e.target.value.substring(0, 200),
                    });
                }}
            />
            <button
                className={styles.ChatCreationZone_Button}
                onClick={() => {
                    if (
                        inputData.name !== "" &&
                        inputData.tag !== "" &&
                        inputData.description !== ""
                    ) {
                        setCreationPhase("settings");
                    }
                }}
            >
                Создать
            </button>
        </div>
    );
}

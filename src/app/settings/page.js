"use client";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import { useSelector } from "react-redux";
import { useState, useEffect } from "react";
import Image from "next/image";
import classNames from "classnames";
import edit_icon from "@/../public/edit_icon.png";

export default function Settings() {
    const user = useSelector((state) => state.user);

    const [isChanged, setIsChanged] = useState(false);
    const [userData, setUserData] = useState({
        name: "",
        tag: "",
        email: "",
        phone: "",
    });
    const [selectedImage, setSelectedImage] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(""); // Предпросмотр изображения

    useEffect(() => {
        setUserData({
            name: user.name,
            tag: user.tag,
            email: user.email,
            phone: user.phone,
        });
        setAvatarPreview(user.imageSrc);
    }, [user]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedImage(file);
            setAvatarPreview(URL.createObjectURL(file));
            setIsChanged(true);
        }
    };

    const handleSave = async () => {
        const formData = new FormData();
        formData.append("name", userData.name);
        formData.append("tag", userData.tag);
        formData.append("email", userData.email);
        formData.append("phone", userData.phone);

        if (selectedImage) {
            formData.append("avatar", selectedImage); // Добавляем изображение в FormData
        }

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:8000/api/user/update",
                {
                    method: "POST",
                    body: formData,
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    credentials: "include",
                }
            );

            if (response.ok) {
                const data = await response.json();
                console.log("Данные успешно сохранены", data);
                setIsChanged(false);
                setSelectedImage(null); // Очищаем выбранное изображение
            } else {
                console.error("Ошибка при сохранении данных");
            }
        } catch (error) {
            console.error("Ошибка сети", error);
        }
    };

    const handleCancel = () => {
        setUserData({
            name: user.name,
            tag: user.tag,
            email: user.email,
            phone: user.phone,
        });
        setAvatarPreview(user.imageSrc); // Возврат исходного аватара
        setSelectedImage(null); // Сброс выбранного изображения
        setIsChanged(false);
    };

    return (
        <>
            <MenuBar />
            <div className={styles.settings}>
                <div
                    className={classNames(
                        styles.settings_Profile,
                        isChanged ? styles.settings_Profile_Changing : ""
                    )}
                >
                    <h2 className={styles.settings_ProfileTitle}>Профиль</h2>
                    <div className={styles.settings_ProfileAvatarContainer}>
                        <input
                            type="file"
                            id="avatar"
                            accept="image/*"
                            className={styles.settings_ProfileAvatar_Input}
                            onChange={handleImageChange}
                        />
                        <label
                            htmlFor="avatar"
                            className={styles.settings_ProfileAvatar_Label}
                        >
                            <Image
                                src={edit_icon}
                                alt="Изменить аватар"
                                width={48}
                                height={48}
                                className={
                                    styles.settings_ProfileAvatar_ChangeIcon
                                }
                            />
                        </label>
                        <Image
                            src={avatarPreview} // Используем preview или исходный аватар
                            alt="Аватар"
                            width={150}
                            height={150}
                            className={styles.settings_ProfileAvatar}
                        />
                    </div>

                    <div className={styles.settings_Profile_Item}>
                        <p>Никнейм:</p>
                        <input
                            type="text"
                            value={userData.name}
                            onChange={(e) => {
                                setUserData({
                                    ...userData,
                                    name: e.target.value,
                                });
                                setIsChanged(true);
                            }}
                        />
                    </div>
                    <div className={styles.settings_Profile_Item}>
                        <p>Тег:</p>
                        <input
                            type="text"
                            value={userData.tag}
                            onChange={(e) => {
                                setUserData({
                                    ...userData,
                                    tag: e.target.value,
                                });
                                setIsChanged(true);
                            }}
                        />
                    </div>
                    <div className={styles.settings_Profile_Item}>
                        <p>Email:</p>
                        <input
                            type="email"
                            value={userData.email}
                            onChange={(e) => {
                                setUserData({
                                    ...userData,
                                    email: e.target.value,
                                });
                                setIsChanged(true);
                            }}
                        />
                    </div>
                    <div className={styles.settings_Profile_Item}>
                        <p>Phone:</p>
                        <input
                            type="text"
                            value={userData.phone}
                            onChange={(e) => {
                                setUserData({
                                    ...userData,
                                    phone: e.target.value,
                                });
                                setIsChanged(true);
                            }}
                        />
                    </div>

                    <div
                        className={classNames(
                            styles.settings_Profile_ButtonsContainer,
                            isChanged
                                ? styles.settings_Profile_ButtonsContainer_Changing
                                : ""
                        )}
                    >
                        <button
                            className={styles.settings_Profile_Button}
                            onClick={handleCancel}
                        >
                            Отмена
                        </button>
                        <button
                            className={styles.settings_Profile_Button}
                            onClick={handleSave}
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

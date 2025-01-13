"use client";
import { useState, Suspense } from "react";
import { useDispatch } from "react-redux";
import { setUser } from "@/app/store/user/user";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import classNames from "classnames";

function AuthContent() {
    const [authMode, setAuthMode] = useState("login");
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    const dispatch = useDispatch();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirectTo") || "/"; // Получаем redirectTo или "/" по умолчанию

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        const url =
            authMode === "login"
                ? "http://localhost:8000/api/login"
                : "http://localhost:8000/api/register";
        const body =
            authMode === "login"
                ? { email: formData.email, password: formData.password }
                : {
                      name: formData.name,
                      email: formData.email,
                      password: formData.password,
                  };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                credentials: "include", // Отправка с куками
            });

            if (!res.ok) throw new Error("Ошибка авторизации/регистрации");

            const data = await res.json();
            localStorage.setItem("token", data.token); // Сохраняем токен
            dispatch(
                setUser({
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    tag: data.tag,
                    imageSrc: data.avatar || null,
                    description: data.description || null,
                    token: data.token, // Сохраняем токен в Redux
                })
            );
            alert(
                authMode === "login"
                    ? "Вы успешно вошли"
                    : "Регистрация завершена успешно"
            );

            router.push(redirectTo); // Перенаправление на указанную страницу
        } catch (err) {
            console.error(err.message);
            alert("Ошибка: " + err.message);
        }
    };

    return (
        <div className={styles.auth}>
            <div
                className={classNames(
                    styles.authForm,
                    authMode === "register" ? styles.authFormRegister : ""
                )}
            >
                {authMode === "login" ? (
                    <div className={styles.authForm_Login}>
                        <h1 style={{ color: "lightgrey" }}>Авторизация</h1>
                        <input
                            className={styles.FormItem}
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="Email"
                            type="text"
                        />
                        <input
                            className={styles.FormItem}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Пароль"
                            type="password"
                        />
                        <button
                            className={styles.FormSubmit}
                            onClick={handleSubmit}
                        >
                            Войти
                        </button>
                    </div>
                ) : (
                    <></>
                )}
                {authMode === "register" ? (
                    <div className={styles.authForm_Login}>
                        <h1 style={{ color: "lightgrey" }}>Регистрация</h1>
                        <input
                            className={styles.FormItem}
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Никнейм"
                            type="text"
                        />
                        <input
                            className={styles.FormItem}
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="Email"
                            type="text"
                        />
                        <input
                            className={styles.FormItem}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Пароль"
                            type="password"
                        />
                        <input
                            className={styles.FormItem}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            placeholder="Повтор пароля"
                            type="password"
                        />
                        <button
                            className={styles.FormSubmit}
                            onClick={handleSubmit}
                        >
                            Зарегаться
                        </button>
                    </div>
                ) : (
                    <></>
                )}
                <div
                    style={{
                        width: "100%",
                        height: "1px",
                        backgroundColor: "lightgrey",
                    }}
                ></div>
                <p
                    className={classNames(
                        styles.textButton,
                        styles.textButtonSwitchMode
                    )}
                    onClick={() =>
                        setAuthMode(authMode === "login" ? "register" : "login")
                    }
                >
                    {authMode === "login" ? "Регистрация" : "Авторизация"}
                </p>
            </div>
        </div>
    );
}

export default function Auth() {
    return (
        <Suspense fallback={<div>Загрузка...</div>}>
            <AuthContent />
        </Suspense>
    );
}

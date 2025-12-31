"use client";
import { useState, Suspense } from "react";
import { useDispatch } from "react-redux";
import { setUser } from "@/app/store/user/user";
import { useRouter, useSearchParams } from "next/navigation";
import MultiStepRegistration from "@/app/components/registration/MultiStepRegistration";
import styles from "./page.module.css";
import classNames from "classnames";
import { apiUrl } from "@/services/apiConfig";

function AuthContent() {
  const [authMode, setAuthMode] = useState("login");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const handleChange = (e) => {
    let val = e.target.value;
    if (e.target.name === "password" || e.target.name === "email") {
      val = val.replace(/\s+/g, "");
    }
    setFormData({ ...formData, [e.target.name]: val });
  };

  const handleLoginSubmit = async () => {
    if (!formData.email || !formData.password) {
      alert("Пожалуйста, заполните все поля");
      return;
    }

    if (
      !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)
    ) {
      alert("Введите корректный email");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(apiUrl("/api/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Ошибка авторизации");
      }

      const data = await res.json();
      localStorage.setItem("token", data.token);

      dispatch(
        setUser({
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          tag: data.tag,
          imageSrc: data.avatar || null,
          description: data.description || null,
          token: data.token,
        })
      );

      router.push(redirectTo);
    } catch (err) {
      console.error(err.message);
      alert("Ошибка: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToRegister = () => {
    setAuthMode("register");
  };

  const handleSwitchToLogin = () => {
    setAuthMode("login");
    setFormData({ email: "", password: "" });
  };

  return (
    <div className={styles.auth}>
      {authMode === "login" ? (
        <div className={styles.authForm}>
          <div className={styles.authForm_Login}>
            <h1 className={styles.title}>Авторизация</h1>

            <div className={styles.inputGroup}>
              <input
                className={styles.FormItem}
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email"
                type="email"
                disabled={isLoading}
                autoComplete="email"
              />
              <input
                className={styles.FormItem}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Пароль"
                type="password"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <button
              className={styles.FormSubmit}
              onClick={handleLoginSubmit}
              disabled={isLoading}
            >
              {isLoading ? "Вход..." : "Войти"}
            </button>
          </div>

          <div className={styles.divider}></div>

          <p
            className={classNames(
              styles.textButton,
              styles.textButtonSwitchMode
            )}
            onClick={handleSwitchToRegister}
          >
            Создать аккаунт
          </p>
        </div>
      ) : (
        <MultiStepRegistration onSwitchToLogin={handleSwitchToLogin} />
      )}
    </div>
  );
}

export default function Auth() {
  return (
    <Suspense
      fallback={
        <div className={styles.auth}>
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Загрузка...</p>
          </div>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}

"use client";
import styles from "./page.module.css";

import MenuBar from "@/components/MenuBar/MenuBar";
import BackArrow from "@/components/BackArrow/BackArrow";
import { useSelector, useDispatch } from "react-redux";
import { useState, useEffect } from "react";
import Image from "next/image";
import classNames from "classnames";
import edit_icon from "@/../public/edit_icon.png";
import { updateUser } from "@/app/store/user/user";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { apiUrl } from "@/services/apiConfig";

function getInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
}

export default function Settings() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);

  const [isChanged, setIsChanged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [isCheckingUniqueness, setIsCheckingUniqueness] = useState({});
  const [userData, setUserData] = useState({
    name: "",
    tag: "",
    email: "",
    phone: "",
    description: "",
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(""); // Предпросмотр изображения
  const [errors, setErrors] = useState({});
  const [checkTimeouts, setCheckTimeouts] = useState({});

  // Создаем данные напрямую из Redux
  const currentUserData = {
    name: user?.name || "",
    tag: user?.tag || "",
    email: user?.email || "",
    phone: user?.phone || "",
    description: user?.description || "",
  };

  const currentAvatarPreview = user?.imageSrc || "";
  const currentAvatarError = !user?.imageSrc;

  useEffect(() => {
    console.log("User data from Redux:", user); // Отладка

    if (user && user.id) {
      // Проверяем что пользователь загружен
      console.log("Setting userData from useEffect:", currentUserData);
      setUserData(currentUserData);
      setAvatarPreview(currentAvatarPreview);
      setAvatarError(currentAvatarError);
    }
  }, [
    user,
    user?.id,
    user?.name,
    user?.email,
    user?.tag,
    user?.phone,
    user?.description,
    user?.imageSrc,
  ]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors((prev) => ({
          ...prev,
          avatar: "Размер файла не должен превышать 5MB",
        }));
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setErrors((prev) => ({
          ...prev,
          avatar: "Пожалуйста, выберите изображение",
        }));
        return;
      }

      setErrors((prev) => ({ ...prev, avatar: null }));
      setSelectedImage(file);
      setAvatarPreview(URL.createObjectURL(file));
      setAvatarError(false);
      setIsChanged(true);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!userData.name.trim()) {
      newErrors.name = "Никнейм обязателен";
    } else if (userData.name.length < 2) {
      newErrors.name = "Никнейм должен содержать минимум 2 символа";
    }

    if (!userData.tag.trim()) {
      newErrors.tag = "Тег обязателен";
    } else if (userData.tag.length < 3) {
      newErrors.tag = "Тег должен содержать минимум 3 символа";
    } else if (userData.tag.length > 20) {
      newErrors.tag = "Тег не должен превышать 20 символов";
    } else if (!/^[a-zA-Z0-9_]+$/.test(userData.tag)) {
      newErrors.tag = "Тег может содержать только буквы, цифры и подчеркивания";
    } else if (/^[0-9]/.test(userData.tag)) {
      newErrors.tag = "Тег не может начинаться с цифры";
    }

    if (!userData.email.trim()) {
      newErrors.email = "Email обязателен";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      newErrors.email = "Введите корректный email";
    }

    if (userData.phone && userData.phone.trim()) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(userData.phone.replace(/[\s\-\(\)]/g, ""))) {
        newErrors.phone = "Введите корректный номер телефона";
      }
    }

    if (userData.description && userData.description.length > 200) {
      newErrors.description = "Описание не должно превышать 200 символов";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkUniqueness = async (field, value) => {
    if (!value.trim() || value === user[field]) {
      // Если значение пустое или не изменилось, не проверяем
      return;
    }

    setIsCheckingUniqueness((prev) => ({ ...prev, [field]: true }));

    try {
      const response = await fetch(
        apiUrl("/api/user/check-unique"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ field, value: value.trim() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка проверки");
      }

      if (!data.available) {
        setErrors((prev) => ({
          ...prev,
          [field]:
            field === "tag"
              ? "Этот тег уже занят"
              : field === "email"
              ? "Этот email уже используется"
              : field === "phone"
              ? "Этот номер телефона уже используется"
              : "Это значение уже используется",
        }));
      } else {
        // Очищаем ошибку если значение доступно
        setErrors((prev) => ({ ...prev, [field]: null }));
      }
    } catch (error) {
      console.error("Ошибка проверки уникальности:", error);
      setErrors((prev) => ({
        ...prev,
        [field]: "Ошибка проверки доступности",
      }));
    } finally {
      setIsCheckingUniqueness((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    // Проверяем, что нет активных проверок уникальности и нет ошибок уникальности
    const hasActiveChecks = Object.values(isCheckingUniqueness).some(
      (checking) => checking
    );
    const hasUniquenessErrors = ["tag", "email", "phone"].some(
      (field) =>
        errors[field] &&
        (errors[field].includes("уже занят") ||
          errors[field].includes("уже используется"))
    );

    if (hasActiveChecks) {
      toast.warning("Дождитесь завершения проверки уникальности данных");
      return;
    }

    if (hasUniquenessErrors) {
      toast.error("Исправьте ошибки уникальности данных перед сохранением");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("name", userData.name.trim());
    formData.append("tag", userData.tag.trim());
    formData.append("email", userData.email.trim());
    formData.append("phone", userData.phone.trim());
    formData.append("description", userData.description.trim());

    if (selectedImage) {
      formData.append("avatar", selectedImage);
    }

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(apiUrl("/api/user/update"), {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Данные успешно сохранены", data);

        // Обновляем данные пользователя в Redux store с данными от сервера
        dispatch(
          updateUser({
            name: data.name,
            tag: data.tag,
            email: data.email,
            phone: data.phone,
            description: data.description,
            imageSrc: data.imageSrc, // Используем путь к аватару от сервера
          })
        );

        // Обновляем локальное состояние с данными от сервера
        setUserData({
          name: data.name,
          tag: data.tag,
          email: data.email,
          phone: data.phone,
          description: data.description,
        });

        // Обновляем превью аватара
        setAvatarPreview(data.imageSrc || "");
        setAvatarError(!data.imageSrc);

        setIsChanged(false);
        setSelectedImage(null);
        setErrors({});

        // Show success toast
        toast.success("Данные успешно сохранены!");
      } else {
        const errorData = await response.json();

        // При любой ошибке сбрасываем форму к исходному состоянию
        if (user && user.id) {
          const currentUserData = {
            name: user.name || "",
            tag: user.tag || "",
            email: user.email || "",
            phone: user.phone || "",
            description: user.description || "",
          };

          setUserData(currentUserData);
          setAvatarPreview(user.imageSrc || "");
          setAvatarError(!user.imageSrc);
        }
        setSelectedImage(null);
        setIsChanged(false);

        // Обрабатываем ошибки конфликта (409) - занятые поля
        if (response.status === 409) {
          const errorMessage =
            errorData.error || "Ошибка при сохранении данных";

          // Определяем какое поле вызвало ошибку и устанавливаем соответствующую ошибку
          if (errorMessage.includes("тег")) {
            setErrors((prev) => ({ ...prev, tag: errorMessage }));
          } else if (errorMessage.includes("email")) {
            setErrors((prev) => ({ ...prev, email: errorMessage }));
          } else if (errorMessage.includes("телефон")) {
            setErrors((prev) => ({ ...prev, phone: errorMessage }));
          }

          toast.error(errorMessage);
        } else {
          toast.error(errorData.error || "Ошибка при сохранении данных");
        }
      }
    } catch (error) {
      console.error("Ошибка сети", error);

      // При ошибке сети также сбрасываем форму к исходному состоянию
      if (user && user.id) {
        const currentUserData = {
          name: user.name || "",
          tag: user.tag || "",
          email: user.email || "",
          phone: user.phone || "",
          description: user.description || "",
        };

        setUserData(currentUserData);
        setAvatarPreview(user.imageSrc || "");
        setAvatarError(!user.imageSrc);
      }
      setSelectedImage(null);
      setIsChanged(false);

      toast.error("Ошибка сети. Попробуйте позже.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (user && user.id) {
      // Сбрасываем к текущим сохраненным данным пользователя из Redux
      const currentUserData = {
        name: user.name || "",
        tag: user.tag || "",
        email: user.email || "",
        phone: user.phone || "",
        description: user.description || "",
      };

      setUserData(currentUserData);
      setAvatarPreview(user.imageSrc || "");
      setAvatarError(!user.imageSrc);
    }
    setSelectedImage(null);
    setIsChanged(false);
    setErrors({});
  };

  const handleAvatarError = () => {
    setAvatarError(true);
  };

  const handleInputChange = (field, value) => {
    setUserData((prev) => ({ ...prev, [field]: value }));
    setIsChanged(true);
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }

    // Проверка уникальности для определенных полей с задержкой
    if (["tag", "email", "phone"].includes(field)) {
      // Очищаем предыдущий таймер
      if (checkTimeouts[field]) {
        clearTimeout(checkTimeouts[field]);
      }

      // Устанавливаем новый таймер
      const timeout = setTimeout(() => {
        checkUniqueness(field, value);
      }, 800); // Задержка 800мс

      setCheckTimeouts((prev) => ({ ...prev, [field]: timeout }));
    }
  };

  // Инициализируем userData если он пустой, но user есть
  if (
    user &&
    !userData.name &&
    !userData.email &&
    !userData.tag &&
    (user.name || user.email || user.tag)
  ) {
    console.log("Force setting userData:", currentUserData);
    setUserData(currentUserData);
    setAvatarPreview(currentAvatarPreview);
    setAvatarError(currentAvatarError);
  }

  // Показываем загрузку только если пользователь совсем не загружен
  if (!user) {
    return (
      <>
        <MenuBar />
        <div className={styles.settings}>
          <div className={styles.settings_Profile}>
            <h2 className={styles.settings_ProfileTitle}>Загрузка...</h2>
          </div>
        </div>
      </>
    );
  }

  // (debug logs removed)

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
          <BackArrow />
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
                className={styles.settings_ProfileAvatar_ChangeIcon}
              />
            </label>

            {avatarError || !avatarPreview ? (
              <div
                className={classNames(
                  styles.settings_ProfileAvatar,
                  styles.settings_ProfileAvatar_Initials
                )}
                aria-label="Аватар"
              >
                {getInitials(userData.name)}
              </div>
            ) : (
              <Image
                src={avatarPreview}
                alt="Аватар"
                width={150}
                height={150}
                className={styles.settings_ProfileAvatar}
                onError={handleAvatarError}
              />
            )}

            {errors.avatar && (
              <div className={styles.settings_ErrorMessage}>
                {errors.avatar}
              </div>
            )}
          </div>

          <div className={styles.settings_Profile_Item}>
            <p>Никнейм:</p>
            <div className={styles.settings_Profile_InputContainer}>
              <input
                type="text"
                value={userData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className={
                  errors.name ? styles.settings_Profile_Input_Error : ""
                }
                placeholder="Введите никнейм"
              />
              {errors.name && (
                <div className={styles.settings_ErrorMessage}>
                  {errors.name}
                </div>
              )}
            </div>
          </div>
          <div className={styles.settings_Profile_Item}>
            <p>Тег:</p>
            <div className={styles.settings_Profile_InputContainer}>
              <input
                type="text"
                value={userData.tag}
                onChange={(e) => handleInputChange("tag", e.target.value)}
                className={
                  errors.tag ? styles.settings_Profile_Input_Error : ""
                }
                placeholder="username123"
              />
              {isCheckingUniqueness.tag && (
                <div
                  className={styles.settings_ErrorMessage}
                  style={{ color: "#a85400" }}
                >
                  Проверяем доступность тега...
                </div>
              )}
              {errors.tag && !isCheckingUniqueness.tag && (
                <div className={styles.settings_ErrorMessage}>{errors.tag}</div>
              )}
            </div>
          </div>
          <div className={styles.settings_Profile_Item}>
            <p>Email:</p>
            <div className={styles.settings_Profile_InputContainer}>
              <input
                type="email"
                value={userData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={
                  errors.email ? styles.settings_Profile_Input_Error : ""
                }
                placeholder="example@email.com"
              />
              {isCheckingUniqueness.email && (
                <div
                  className={styles.settings_ErrorMessage}
                  style={{ color: "#a85400" }}
                >
                  Проверяем доступность email...
                </div>
              )}
              {errors.email && !isCheckingUniqueness.email && (
                <div className={styles.settings_ErrorMessage}>
                  {errors.email}
                </div>
              )}
            </div>
          </div>
          <div className={styles.settings_Profile_Item}>
            <p>Телефон:</p>
            <div className={styles.settings_Profile_InputContainer}>
              <input
                type="text"
                value={userData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={
                  errors.phone ? styles.settings_Profile_Input_Error : ""
                }
                placeholder="+7 (999) 123-45-67"
              />
              {isCheckingUniqueness.phone && (
                <div
                  className={styles.settings_ErrorMessage}
                  style={{ color: "#a85400" }}
                >
                  Проверяем доступность телефона...
                </div>
              )}
              {errors.phone && !isCheckingUniqueness.phone && (
                <div className={styles.settings_ErrorMessage}>
                  {errors.phone}
                </div>
              )}
            </div>
          </div>

          <div className={styles.settings_Profile_DescriptionContainer}>
            <textarea
              value={userData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              className={classNames(
                styles.settings_Profile_Description,
                errors.description ? styles.settings_Profile_Input_Error : ""
              )}
              placeholder="Расскажите немного о себе..."
              maxLength={200}
              rows={3}
            />
            {errors.description && (
              <div className={styles.settings_ErrorMessage}>
                {errors.description}
              </div>
            )}
            <div className={styles.settings_CharacterCount}>
              {userData.description.length}/200
            </div>
          </div>

          <div
            className={classNames(
              styles.settings_Profile_ButtonsContainer,
              isChanged ? styles.settings_Profile_ButtonsContainer_Changing : ""
            )}
          >
            <button
              className={styles.settings_Profile_Button}
              onClick={handleCancel}
              disabled={isLoading}
            >
              Отмена
            </button>
            <button
              className={classNames(
                styles.settings_Profile_Button,
                styles.settings_Profile_Button_Save
              )}
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
}

"use client";
import { useDispatch, useSelector } from "react-redux";
import { useState, useRef } from "react";
import {
  selectFormData,
  selectValidation,
  setAvatar,
} from "@/app/store/registration/registrationSlice";
import styles from "./RegistrationStep.module.css";

const Step3Completion = ({ onSubmit }) => {
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const validation = useSelector(selectValidation);

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarChange = (file) => {
    if (!file) return;

    // Проверяем тип файла
    if (!file.type.startsWith("image/")) {
      alert("Пожалуйста, выберите изображение");
      return;
    }

    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Размер файла не должен превышать 5MB");
      return;
    }

    // Создаем превью
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // Сохраняем файл в Redux
    dispatch(setAvatar(file));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    handleAvatarChange(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    handleAvatarChange(file);
  };

  const removeAvatar = () => {
    setAvatarPreview(null);
    dispatch(setAvatar(null));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const generateInitials = (name) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={styles.stepContainer}>
      <p className={styles.stepDescription}>
        Добавьте аватар и проверьте введенные данные перед завершением
        регистрации
      </p>

      <div className={styles.completionContent}>
        {/* Секция аватара */}
        <div className={styles.avatarSection}>
          <h3 className={styles.sectionTitle}>Аватар профиля</h3>

          <div className={styles.avatarContainer}>
            <div
              className={`${styles.avatarUpload} ${
                isDragOver ? styles.dragOver : ""
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarPreview ? (
                <div className={styles.avatarPreview}>
                  <img src={avatarPreview} alt="Avatar preview" />
                  <button
                    className={styles.removeAvatarButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAvatar();
                    }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <div className={styles.defaultAvatar}>
                    {formData.name ? generateInitials(formData.name) : "?"}
                  </div>
                  <div className={styles.uploadText}>
                    <span className={styles.uploadIcon}>📷</span>
                    <span>Нажмите или перетащите изображение</span>
                    <small>PNG, JPG до 5MB</small>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {/* Секция подтверждения данных */}
        <div className={styles.confirmationSection}>
          <h3 className={styles.sectionTitle}>Подтверждение данных</h3>

          <div className={styles.dataPreview}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Имя:</span>
              <span className={styles.dataValue}>{formData.name}</span>
            </div>

            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Email:</span>
              <span className={styles.dataValue}>{formData.email}</span>
            </div>

            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Тег:</span>
              <span className={styles.dataValue}>@{formData.tag}</span>
            </div>

            {formData.phone && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Телефон:</span>
                <span className={styles.dataValue}>{formData.phone}</span>
              </div>
            )}

            {formData.description && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Описание:</span>
                <span className={styles.dataValue}>{formData.description}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.stepInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>✨</span>
          <span className={styles.infoText}>
            Аватар поможет другим пользователям легче вас узнать
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>🔄</span>
          <span className={styles.infoText}>
            Все данные можно будет изменить позже в настройках профиля
          </span>
        </div>
      </div>
    </div>
  );
};

export default Step3Completion;

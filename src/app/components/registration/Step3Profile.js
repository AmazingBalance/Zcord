"use client";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import {
  selectFormData,
  selectValidation,
  updateFormData,
  setValidationError,
  checkTagAvailability,
} from "@/app/store/registration/registrationSlice";
import InputField from "./InputField";
import styles from "./RegistrationStep.module.css";

const Step3Profile = () => {
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const validation = useSelector(selectValidation);
  const isCheckingTag = useSelector(
    (state) => state.registration.isCheckingTag
  );
  const tagAvailable = useSelector((state) => state.registration.tagAvailable);

  const [tagCheckTimeout, setTagCheckTimeout] = useState(null);

  const handleChange = (field, value) => {
    dispatch(updateFormData({ field, value }));

    // Валидация в реальном времени
    if (field === "tag") {
      validateTag(value);
    } else {
      validateField(field, value);
    }
  };

  const validateTag = (value) => {
    // Очищаем предыдущий таймер
    if (tagCheckTimeout) {
      clearTimeout(tagCheckTimeout);
    }

    let isValid = true;
    let message = "";

    if (!value.trim()) {
      isValid = false;
      message = "Тег обязателен для заполнения";
    } else if (value.length < 3) {
      isValid = false;
      message = "Тег должен содержать минимум 3 символа";
    } else if (value.length > 20) {
      isValid = false;
      message = "Тег не должен превышать 20 символов";
    } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      isValid = false;
      message = "Тег может содержать только буквы, цифры и подчеркивания";
    } else if (/^[0-9]/.test(value)) {
      isValid = false;
      message = "Тег не может начинаться с цифры";
    }

    if (!isValid) {
      dispatch(setValidationError({ step: 3, field: "tag", message }));
    } else {
      // Проверяем доступность тега с задержкой
      const timeout = setTimeout(() => {
        dispatch(checkTagAvailability(value));
      }, 500);
      setTagCheckTimeout(timeout);
    }
  };

  const validateField = (field, value) => {
    let isValid = true;
    let message = "";

    switch (field) {
      case "phone":
        if (value && value.trim()) {
          // Телефон опционален, но если введен, должен быть корректным
          const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
          if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ""))) {
            isValid = false;
            message = "Введите корректный номер телефона";
          }
        }
        break;

      case "description":
        if (value && value.length > 200) {
          isValid = false;
          message = "Описание не должно превышать 200 символов";
        }
        break;

      default:
        break;
    }

    if (!isValid) {
      dispatch(setValidationError({ step: 3, field, message }));
    }
  };

  // Генерируем предложения тегов на основе имени
  const generateTagSuggestions = () => {
    if (!formData.name) return [];

    const baseName = formData.name.toLowerCase().replace(/\s+/g, "");
    const suggestions = [
      baseName,
      `${baseName}_user`,
      `${baseName}123`,
      `user_${baseName}`,
    ];

    return suggestions.filter((tag) => tag.length >= 3 && tag.length <= 20);
  };

  const tagSuggestions = generateTagSuggestions();

  const getTagStatus = () => {
    if (isCheckingTag) {
      return { type: "loading", message: "Проверяем доступность..." };
    }

    if (tagAvailable === true) {
      return { type: "success", message: "Тег доступен!" };
    }

    if (tagAvailable === false) {
      return { type: "error", message: "Тег уже занят" };
    }

    return null;
  };

  const tagStatus = getTagStatus();

  return (
    <div className={styles.stepContainer}>
      <p className={styles.stepDescription}>
        Настройте ваш профиль и выберите уникальный тег
      </p>

      <div className={styles.fieldsContainer}>
        <div className={styles.fieldGroup}>
          <InputField
            label="Тег пользователя"
            type="text"
            value={formData.tag}
            onChange={(value) => handleChange("tag", value)}
            error={validation.step3.tag.message}
            placeholder="your_unique_tag"
            required
            maxLength={20}
            prefix="@"
            status={tagStatus}
          />

          {tagSuggestions.length > 0 && !formData.tag && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionsLabel}>Предложения:</span>
              <div className={styles.suggestionsList}>
                {tagSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className={styles.suggestionButton}
                    onClick={() => handleChange("tag", suggestion)}
                    type="button"
                  >
                    @{suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <InputField
          label="Номер телефона"
          type="tel"
          value={formData.phone}
          onChange={(value) => handleChange("phone", value)}
          error={validation.step3.phone.message}
          placeholder="+7 (999) 123-45-67"
          optional
        />

        <InputField
          label="Описание профиля"
          type="textarea"
          value={formData.description}
          onChange={(value) => handleChange("description", value)}
          error={validation.step3.description.message}
          placeholder="Расскажите немного о себе..."
          optional
          maxLength={200}
          rows={3}
        />
      </div>

      <div className={styles.stepInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>🏷️</span>
          <span className={styles.infoText}>
            Тег - это ваш уникальный идентификатор, по которому вас смогут найти
            другие пользователи
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>📱</span>
          <span className={styles.infoText}>
            Телефон и описание можно добавить позже в настройках профиля
          </span>
        </div>
      </div>
    </div>
  );
};

export default Step3Profile;

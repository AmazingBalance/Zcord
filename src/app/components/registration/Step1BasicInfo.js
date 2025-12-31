"use client";
import { useDispatch, useSelector } from "react-redux";
import {
  selectFormData,
  selectValidation,
  updateFormData,
  setValidationError,
} from "@/app/store/registration/registrationSlice";
import InputField from "./InputField";
import styles from "./RegistrationStep.module.css";

const Step1BasicInfo = () => {
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const validation = useSelector(selectValidation);

  const handleChange = (field, value) => {
    dispatch(updateFormData({ field, value }));

    // Валидация в реальном времени
    validateField(field, value);
  };

  const validateField = (field, value) => {
    let isValid = true;
    let message = "";

    switch (field) {
      case "name":
        if (!value.trim()) {
          isValid = false;
          message = "Имя обязательно для заполнения";
        } else if (value.trim().length < 2) {
          isValid = false;
          message = "Имя должно содержать минимум 2 символа";
        } else if (value.trim().length > 50) {
          isValid = false;
          message = "Имя не должно превышать 50 символов";
        }
        break;

      case "email":
        if (!value.trim()) {
          isValid = false;
          message = "Email обязателен для заполнения";
        } else {
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(value)) {
            isValid = false;
            message = "Введите корректный email адрес";
          }
        }
        break;

      default:
        break;
    }

    if (!isValid) {
      dispatch(setValidationError({ step: 1, field, message }));
    }
  };

  return (
    <div className={styles.stepContainer}>
      <p className={styles.stepDescription}>
        Введите основную информацию для создания аккаунта
      </p>

      <div className={styles.fieldsContainer}>
        <InputField
          label="Имя пользователя"
          type="text"
          value={formData.name}
          onChange={(value) => handleChange("name", value)}
          error={validation.step1.name.message}
          placeholder="Введите ваше имя"
          required
          maxLength={50}
        />

        <InputField
          label="Email"
          type="email"
          value={formData.email}
          onChange={(value) => handleChange("email", value)}
          error={validation.step1.email.message}
          placeholder="example@email.com"
          required
        />
      </div>

      <div className={styles.stepInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>📧</span>
          <span className={styles.infoText}>
            На указанный email будут отправляться уведомления
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>👤</span>
          <span className={styles.infoText}>
            Имя будет отображаться в вашем профиле
          </span>
        </div>
      </div>
    </div>
  );
};

export default Step1BasicInfo;

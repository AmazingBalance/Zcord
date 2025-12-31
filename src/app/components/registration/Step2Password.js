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

const Step2Password = () => {
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
      case "password":
        if (!value) {
          isValid = false;
          message = "Пароль обязателен для заполнения";
        } else if (value.length < 6) {
          isValid = false;
          message = "Пароль должен содержать минимум 6 символов";
        } else if (value.length > 100) {
          isValid = false;
          message = "Пароль не должен превышать 100 символов";
        } else if (!/(?=.*[a-zA-Z])/.test(value)) {
          isValid = false;
          message = "Пароль должен содержать хотя бы одну букву";
        }

        // Проверяем подтверждение пароля, если оно уже введено
        if (formData.confirmPassword && value !== formData.confirmPassword) {
          dispatch(
            setValidationError({
              step: 2,
              field: "confirmPassword",
              message: "Пароли не совпадают",
            })
          );
        } else if (
          formData.confirmPassword &&
          value === formData.confirmPassword
        ) {
          // Сбрасываем ошибку подтверждения пароля
          dispatch(
            setValidationError({
              step: 2,
              field: "confirmPassword",
              message: "",
            })
          );
        }
        break;

      case "confirmPassword":
        if (!value) {
          isValid = false;
          message = "Подтверждение пароля обязательно";
        } else if (value !== formData.password) {
          isValid = false;
          message = "Пароли не совпадают";
        }
        break;

      default:
        break;
    }

    if (!isValid) {
      dispatch(setValidationError({ step: 2, field, message }));
    }
  };

  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, text: "" };

    let strength = 0;
    let feedback = [];

    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

    if (strength <= 2) return { strength: 1, text: "Слабый", color: "#ff4444" };
    if (strength <= 4)
      return { strength: 2, text: "Средний", color: "#ffaa00" };
    return { strength: 3, text: "Сильный", color: "#44ff44" };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className={styles.stepContainer}>
      <p className={styles.stepDescription}>
        Создайте надежный пароль для защиты вашего аккаунта
      </p>

      <div className={styles.fieldsContainer}>
        <div className={styles.fieldGroup}>
          <InputField
            label="Пароль"
            type="password"
            value={formData.password}
            onChange={(value) => handleChange("password", value)}
            error={validation.step2.password.message}
            placeholder="Минимум 6 символов"
            required
            showPasswordToggle
          />

          {formData.password && (
            <div className={styles.passwordStrength}>
              <div className={styles.strengthBar}>
                <div
                  className={styles.strengthFill}
                  style={{
                    width: `${(passwordStrength.strength / 3) * 100}%`,
                    backgroundColor: passwordStrength.color,
                  }}
                />
              </div>
              <span
                className={styles.strengthText}
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.text}
              </span>
            </div>
          )}
        </div>

        <InputField
          label="Подтверждение пароля"
          type="password"
          value={formData.confirmPassword}
          onChange={(value) => handleChange("confirmPassword", value)}
          error={validation.step2.confirmPassword.message}
          placeholder="Повторите пароль"
          required
          showPasswordToggle
        />
      </div>

      <div className={styles.stepInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>🔒</span>
          <span className={styles.infoText}>
            Используйте комбинацию букв, цифр и символов для максимальной
            безопасности
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>🛡️</span>
          <span className={styles.infoText}>
            Ваш пароль шифруется и надежно хранится
          </span>
        </div>
      </div>
    </div>
  );
};

export default Step2Password;

"use client";
import { useState } from "react";
import styles from "./InputField.module.css";

const InputField = ({
  label,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
  required = false,
  optional = false,
  maxLength,
  rows = 1,
  prefix,
  showPasswordToggle = false,
  status,
  disabled = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hasPrefix = Boolean(prefix);

  const handleChange = (e) => {
    let newValue = e.target.value;

    // Применяем ограничения по длине
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.slice(0, maxLength);
    }

    // Специальная обработка для разных типов полей
    if (type === "email") {
      // Убираем пробелы из email
      newValue = newValue.replace(/\s+/g, "");
    } else if (type === "password") {
      // Убираем пробелы из пароля
      newValue = newValue.replace(/\s+/g, "");
    }

    onChange(newValue);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const getInputType = () => {
    if (type === "password" && showPasswordToggle) {
      return showPassword ? "text" : "password";
    }
    return type;
  };

  const getStatusClass = () => {
    if (error) return styles.error;
    if (status?.type === "success") return styles.success;
    if (status?.type === "loading") return styles.loading;
    if (status?.type === "error") return styles.error;
    return "";
  };

  const renderInput = () => {
    const commonProps = {
      value: value || "",
      onChange: handleChange,
      onFocus: () => setIsFocused(true),
      onBlur: () => setIsFocused(false),
      placeholder,
      disabled,
      maxLength,
      className: `${styles.input} ${hasPrefix ? styles.inputWithPrefix : ""} ${getStatusClass()}`,
    };

    if (type === "textarea") {
      return (
        <textarea
          {...commonProps}
          rows={rows}
          className={`${styles.textarea} ${
            hasPrefix ? styles.textareaWithPrefix : ""
          } ${getStatusClass()}`}
        />
      );
    }

    return (
      <input
        {...commonProps}
        type={getInputType()}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
    );
  };

  return (
    <div
      className={`${styles.fieldContainer} ${isFocused ? styles.focused : ""}`}
    >
      <div className={styles.labelContainer}>
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
          {optional && <span className={styles.optional}>(необязательно)</span>}
        </label>

        {maxLength && (
          <span className={styles.charCount}>
            {(value || "").length}/{maxLength}
          </span>
        )}
      </div>

      <div className={styles.inputContainer}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}

        {renderInput()}

        {showPasswordToggle && type === "password" && (
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={togglePasswordVisibility}
            tabIndex={-1}
            title={showPassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPassword ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>
            )}
          </button>
        )}

        {status?.type === "loading" && (
          <div className={styles.statusIcon}>
            <div className={styles.spinner}></div>
          </div>
        )}

        {status?.type === "success" && (
          <div className={styles.statusIcon}>
            <span className={styles.successIcon}>✓</span>
          </div>
        )}
      </div>

      {(error || status?.message) && (
        <div className={styles.messageContainer}>
          {error && (
            <span className={styles.errorMessage}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </span>
          )}

          {!error && status?.message && (
            <span className={`${styles.statusMessage} ${styles[status.type]}`}>
              {status.type === "success" && (
                <span className={styles.successIcon}>✓</span>
              )}
              {status.type === "loading" && (
                <span className={styles.loadingIcon}>⏳</span>
              )}
              {status.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default InputField;

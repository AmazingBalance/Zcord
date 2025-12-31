"use client";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import {
  selectCurrentStep,
  selectFormData,
  selectValidation,
  selectIsLoading,
  selectError,
  selectCompletedSteps,
  selectIsRegistrationComplete,
  nextStep,
  prevStep,
  goToStep,
  resetRegistration,
  clearError,
  registerUser,
} from "@/app/store/registration/registrationSlice";
import { setUser } from "@/app/store/user/user";
import StepIndicator from "./StepIndicator";
import Step1BasicInfo from "./Step1BasicInfo";
import Step2Password from "./Step2Password";
import Step3Profile from "./Step3Profile";
import Step4Completion from "./Step4Completion";
import styles from "./MultiStepRegistration.module.css";
import { assetUrl } from "@/services/apiConfig";

const MultiStepRegistration = ({ onSwitchToLogin }) => {
  const dispatch = useDispatch();
  const router = useRouter();

  const currentStep = useSelector(selectCurrentStep);
  const formData = useSelector(selectFormData);
  const validation = useSelector(selectValidation);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const completedSteps = useSelector(selectCompletedSteps);
  const isRegistrationComplete = useSelector(selectIsRegistrationComplete);

  // Сброс формы при монтировании компонента
  useEffect(() => {
    dispatch(resetRegistration());
  }, [dispatch]);

  // Обработка завершения регистрации
  useEffect(() => {
    if (isRegistrationComplete) {
      // Перенаправляем на главную страницу через 2 секунды
      const timer = setTimeout(() => {
        router.push("/");
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isRegistrationComplete, router]);

  const handleNext = () => {
    if (validateCurrentStep()) {
      dispatch(nextStep());
    }
  };

  const handlePrev = () => {
    dispatch(prevStep());
  };

  const handleStepClick = (step) => {
    // Можно переходить только к завершенным этапам или следующему этапу
    if (
      completedSteps.includes(step) ||
      step === Math.max(...completedSteps) + 1
    ) {
      dispatch(goToStep(step));
    }
  };

  const validateCurrentStep = () => {
    const currentValidation = validation[`step${currentStep}`];

    // Проверяем все поля текущего этапа
    for (const field in currentValidation) {
      if (!currentValidation[field].isValid) {
        return false;
      }
    }

    // Дополнительная валидация для каждого этапа
    switch (currentStep) {
      case 1:
        return validateStep1();
      case 2:
        return validateStep2();
      case 3:
        return validateStep3();
      case 4:
        return validateStep4();
      default:
        return true;
    }
  };

  const validateStep1 = () => {
    const { name, email } = formData;

    if (!name.trim()) return false;
    if (!email.trim()) return false;

    // Проверка email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;

    return true;
  };

  const validateStep2 = () => {
    const { password, confirmPassword } = formData;

    if (!password) return false;
    if (!confirmPassword) return false;
    if (password !== confirmPassword) return false;

    // Проверка пароля (минимум 6 символов)
    if (password.length < 6) return false;

    return true;
  };

  const validateStep3 = () => {
    const { tag } = formData;

    if (!tag.trim()) return false;

    // Проверка тега (только буквы, цифры и подчеркивания)
    const tagRegex = /^[a-zA-Z0-9_]+$/;
    if (!tagRegex.test(tag)) return false;

    return true;
  };

  const validateStep4 = () => {
    // Четвертый этап не имеет обязательных полей
    return true;
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    // Подготавливаем данные для отправки
    const registrationData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password,
      tag: formData.tag.trim(),
      phone: formData.phone.trim(),
      description: formData.description.trim(),
      avatar: formData.avatar, // Добавляем аватар
    };

    try {
      const result = await dispatch(registerUser(registrationData)).unwrap();

      // Сохраняем пользователя в Redux store
      const avatarUrl = assetUrl(result.avatar);

      dispatch(
        setUser({
          id: result.id,
          name: result.name,
          email: result.email,
          phone: result.phone || "",
          tag: result.tag,
          imageSrc: avatarUrl,
          description: result.description || null,
          token: result.token,
        })
      );

      // Сохраняем токен в localStorage
      if (result.token) {
        localStorage.setItem("token", result.token);
      }
    } catch (error) {
      console.error("Registration failed:", error);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1BasicInfo />;
      case 2:
        return <Step2Password />;
      case 3:
        return <Step3Profile />;
      case 4:
        return <Step4Completion onSubmit={handleSubmit} />;
      default:
        return <Step1BasicInfo />;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return "Основная информация";
      case 2:
        return "Создание пароля";
      case 3:
        return "Настройка профиля";
      case 4:
        return "Завершение";
      default:
        return "Регистрация";
    }
  };

  if (isRegistrationComplete) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.successIcon}>✓</div>
        <h2 className={styles.successTitle}>Регистрация завершена!</h2>
        <p className={styles.successMessage}>
          Добро пожаловать в Zcord! Через несколько секунд вы будете
          перенаправлены на главную страницу.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Регистрация</h1>
        <StepIndicator
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />
      </div>

      <div className={styles.content}>
        <h2 className={styles.stepTitle}>{getStepTitle()}</h2>

        {error && (
          <div className={styles.errorContainer}>
            <span className={styles.errorMessage}>{error}</span>
            <button
              className={styles.errorClose}
              onClick={() => dispatch(clearError())}
            >
              ×
            </button>
          </div>
        )}

        <div className={styles.stepContent}>{renderCurrentStep()}</div>
      </div>

      <div className={styles.navigation}>
        {currentStep > 1 && (
          <button
            className={styles.prevButton}
            onClick={handlePrev}
            disabled={isLoading}
          >
            Назад
          </button>
        )}

        <div className={styles.navigationRight}>
          {currentStep < 4 ? (
            <button
              className={styles.nextButton}
              onClick={handleNext}
              disabled={isLoading || !validateCurrentStep()}
            >
              Далее
            </button>
          ) : (
            <button
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={isLoading || !validateCurrentStep()}
            >
              {isLoading ? "Регистрация..." : "Завершить регистрацию"}
            </button>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.switchText}>
          Уже есть аккаунт?{" "}
          <button
            className={styles.switchButton}
            onClick={onSwitchToLogin}
            disabled={isLoading}
          >
            Войти
          </button>
        </p>
      </div>
    </div>
  );
};

export default MultiStepRegistration;

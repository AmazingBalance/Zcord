"use client";
import styles from "./StepIndicator.module.css";

const StepIndicator = ({ currentStep, completedSteps, onStepClick }) => {
  const steps = [
    { number: 1, title: "Информация" },
    { number: 2, title: "Пароль" },
    { number: 3, title: "Профиль" },
    { number: 4, title: "Завершение" },
  ];

  const getStepStatus = (stepNumber) => {
    if (completedSteps.includes(stepNumber)) {
      return "completed";
    } else if (stepNumber === currentStep) {
      return "current";
    } else if (stepNumber < currentStep) {
      return "completed";
    } else {
      return "upcoming";
    }
  };

  const isStepClickable = (stepNumber) => {
    // Можно кликать на завершенные этапы или следующий этап
    return (
      completedSteps.includes(stepNumber) ||
      stepNumber === Math.max(...completedSteps, 0) + 1
    );
  };

  return (
    <div className={styles.container}>
      {steps.map((step, index) => {
        const status = getStepStatus(step.number);
        const isClickable = isStepClickable(step.number);

        return (
          <div key={step.number} className={styles.stepWrapper}>
            <div
              className={`${styles.step} ${styles[status]} ${
                isClickable ? styles.clickable : ""
              }`}
              onClick={() => isClickable && onStepClick(step.number)}
            >
              <div className={styles.stepNumber}>
                {status === "completed" ? (
                  <span className={styles.checkmark}>✓</span>
                ) : (
                  step.number
                )}
              </div>
              <div className={styles.stepTitle}>{step.title}</div>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`${styles.connector} ${
                  completedSteps.includes(step.number) ? styles.completed : ""
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;

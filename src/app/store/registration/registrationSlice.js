import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiUrl } from "@/services/apiConfig";

// Async thunk для регистрации пользователя
export const registerUser = createAsyncThunk(
  "registration/registerUser",
  async (userData, { rejectWithValue }) => {
    try {
      // Создаем FormData для отправки файлов
      const formData = new FormData();
      formData.append("name", userData.name);
      formData.append("email", userData.email);
      formData.append("password", userData.password);
      formData.append("tag", userData.tag);
      formData.append("phone", userData.phone || "");
      formData.append("description", userData.description || "");

      // Добавляем аватар, если он есть
      if (userData.avatar) {
        formData.append("avatar", userData.avatar);
      }

      const response = await fetch(apiUrl("/api/register"), {
        method: "POST",
        body: formData, // Отправляем FormData вместо JSON
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка регистрации");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk для проверки уникальности тега
export const checkTagAvailability = createAsyncThunk(
  "registration/checkTagAvailability",
  async (tag, { rejectWithValue }) => {
    try {
      const response = await fetch(
        apiUrl(`/api/check-tag?tag=${encodeURIComponent(tag)}`)
      );

      if (!response.ok) {
        throw new Error("Ошибка проверки тега");
      }

      const data = await response.json();
      return data.available;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // Текущий этап регистрации (1, 2, 3, 4)
  currentStep: 1,

  // Данные формы
  formData: {
    // Этап 1: Основная информация
    name: "",
    email: "",

    // Этап 2: Пароль
    password: "",
    confirmPassword: "",

    // Этап 3: Профиль
    tag: "",
    phone: "",
    description: "",

    // Этап 4: Завершение
    avatar: null,
  },

  // Валидация для каждого этапа
  validation: {
    step1: {
      name: { isValid: true, message: "" },
      email: { isValid: true, message: "" },
    },
    step2: {
      password: { isValid: true, message: "" },
      confirmPassword: { isValid: true, message: "" },
    },
    step3: {
      tag: { isValid: true, message: "" },
      phone: { isValid: true, message: "" },
      description: { isValid: true, message: "" },
    },
    step4: {
      avatar: { isValid: true, message: "" },
    },
  },

  // Состояния загрузки и ошибок
  isLoading: false,
  isCheckingTag: false,
  tagAvailable: null,
  error: null,

  // Завершенные этапы
  completedSteps: [],

  // Общее состояние
  isRegistrationComplete: false,
  registeredUser: null,
};

const registrationSlice = createSlice({
  name: "registration",
  initialState,
  reducers: {
    // Обновление данных формы
    updateFormData: (state, action) => {
      const { field, value } = action.payload;
      state.formData[field] = value;

      // Сброс валидации для измененного поля
      const currentStepValidation =
        state.validation[`step${state.currentStep}`];
      if (currentStepValidation && currentStepValidation[field]) {
        currentStepValidation[field] = { isValid: true, message: "" };
      }
    },

    // Переход к следующему этапу
    nextStep: (state) => {
      if (state.currentStep < 4) {
        // Добавляем текущий этап в завершенные
        if (!state.completedSteps.includes(state.currentStep)) {
          state.completedSteps.push(state.currentStep);
        }
        state.currentStep += 1;
      }
    },

    // Переход к предыдущему этапу
    prevStep: (state) => {
      if (state.currentStep > 1) {
        state.currentStep -= 1;
      }
    },

    // Переход к конкретному этапу
    goToStep: (state, action) => {
      const targetStep = action.payload;
      if (targetStep >= 1 && targetStep <= 4) {
        state.currentStep = targetStep;
      }
    },

    // Установка ошибок валидации
    setValidationError: (state, action) => {
      const { step, field, message } = action.payload;
      if (
        state.validation[`step${step}`] &&
        state.validation[`step${step}`][field]
      ) {
        state.validation[`step${step}`][field] = {
          isValid: false,
          message: message,
        };
      }
    },

    // Очистка ошибок валидации для этапа
    clearValidationErrors: (state, action) => {
      const step = action.payload;
      const stepValidation = state.validation[`step${step}`];
      if (stepValidation) {
        Object.keys(stepValidation).forEach((field) => {
          stepValidation[field] = { isValid: true, message: "" };
        });
      }
    },

    // Сброс всей формы
    resetRegistration: (state) => {
      return { ...initialState };
    },

    // Установка аватара
    setAvatar: (state, action) => {
      state.formData.avatar = action.payload;
    },

    // Очистка ошибок
    clearError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // Регистрация пользователя
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isRegistrationComplete = true;
        state.registeredUser = action.payload;
        state.completedSteps = [1, 2, 3];
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // Проверка доступности тега
      .addCase(checkTagAvailability.pending, (state) => {
        state.isCheckingTag = true;
        state.tagAvailable = null;
      })
      .addCase(checkTagAvailability.fulfilled, (state, action) => {
        state.isCheckingTag = false;
        state.tagAvailable = action.payload;

        // Обновляем валидацию тега
        if (!action.payload) {
          state.validation.step2.tag = {
            isValid: false,
            message: "Этот тег уже занят",
          };
        } else {
          state.validation.step2.tag = {
            isValid: true,
            message: "",
          };
        }
      })
      .addCase(checkTagAvailability.rejected, (state, action) => {
        state.isCheckingTag = false;
        state.tagAvailable = null;
        state.validation.step2.tag = {
          isValid: false,
          message: action.payload || "Ошибка проверки тега",
        };
      });
  },
});

export const {
  updateFormData,
  nextStep,
  prevStep,
  goToStep,
  setValidationError,
  clearValidationErrors,
  resetRegistration,
  setAvatar,
  clearError,
} = registrationSlice.actions;

export default registrationSlice.reducer;

// Селекторы
export const selectRegistration = (state) => state.registration;
export const selectCurrentStep = (state) => state.registration.currentStep;
export const selectFormData = (state) => state.registration.formData;
export const selectValidation = (state) => state.registration.validation;
export const selectIsLoading = (state) => state.registration.isLoading;
export const selectError = (state) => state.registration.error;
export const selectCompletedSteps = (state) =>
  state.registration.completedSteps;
export const selectIsRegistrationComplete = (state) =>
  state.registration.isRegistrationComplete;

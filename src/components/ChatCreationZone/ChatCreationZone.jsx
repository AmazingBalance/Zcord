"use client";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import Image from "next/image";
import styles from "./styles.module.css";
import BackArrow from "@/components/BackArrow/BackArrow";
import edit_icon from "@/../public/edit_icon.png";
import { apiUrl } from "@/services/apiConfig";

const ChatCreationZone = ({ type }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    tag: "",
    description: "",
    avatar: null,
    selectedParticipants: [],
  });
  const [validation, setValidation] = useState({
    name: { isValid: true, message: "" },
    tag: { isValid: true, message: "" },
    description: { isValid: true, message: "" },
  });
  const [isCheckingTag, setIsCheckingTag] = useState(false);
  const [tagAvailable, setTagAvailable] = useState(null);
  const [tagCheckTimeout, setTagCheckTimeout] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const user = useSelector((state) => state.user);
  const friendsList = user?.friends_list || [];

  const totalSteps = 2; // Теперь и чат, и канал имеют 2 этапа

  // Tag validation and uniqueness check
  const validateTag = async (value) => {
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
    } else if (value.length > 22) {
      isValid = false;
      message = "Тег не должен превышать 22 символа";
    } else if (!/^[\p{L}\p{N}_-]+$/u.test(value)) {
      isValid = false;
      message =
        "Тег может содержать только буквы, цифры, дефисы и подчеркивания";
    } else if (/^[0-9]/.test(value)) {
      isValid = false;
      message = "Тег не может начинаться с цифры";
    }

    setValidation((prev) => ({
      ...prev,
      tag: { isValid, message },
    }));

    if (isValid) {
      setIsCheckingTag(true);
      setTagAvailable(null);

      const timeout = setTimeout(async () => {
        try {
          const response = await fetch(
            apiUrl(`/api/check-chat-tag?tag=${value}`)
          );
          const data = await response.json();

          if (response.ok) {
            setTagAvailable(data.available);

            if (!data.available) {
              setValidation((prev) => ({
                ...prev,
                tag: { isValid: false, message: "Этот тег уже занят" },
              }));
            }
          } else {
            console.error("Error response:", data);
            // Если ошибка API, считаем тег доступным
            setTagAvailable(true);
          }
        } catch (error) {
          console.error("Error checking tag availability:", error);
          // При ошибке сети считаем тег доступным
          setTagAvailable(true);
        } finally {
          setIsCheckingTag(false);
        }
      }, 500);

      setTagCheckTimeout(timeout);
    } else {
      setIsCheckingTag(false);
      setTagAvailable(null);
    }
  };

  const validateField = (field, value) => {
    let isValid = true;
    let message = "";

    switch (field) {
      case "name":
        if (!value.trim()) {
          isValid = false;
          message = "Название обязательно для заполнения";
        } else if (value.length < 2) {
          isValid = false;
          message = "Название должно содержать минимум 2 символа";
        } else if (value.length > 30) {
          isValid = false;
          message = "Название не должно превышать 30 символов";
        }
        break;
      case "description":
        if (value && value.length > 200) {
          isValid = false;
          message = "Описание не должно превышать 200 символов";
        }
        break;
    }

    setValidation((prev) => ({
      ...prev,
      [field]: { isValid, message },
    }));
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (field === "tag") {
      validateTag(value);
    } else {
      validateField(field, value);
    }
  };

  const handleAvatarChange = (file) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
        setFormData((prev) => ({ ...prev, avatar: file }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAvatar = () => {
    setAvatarPreview(null);
    setFormData((prev) => ({ ...prev, avatar: null }));
  };

  const generateInitials = (name) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const toggleParticipant = (friend) => {
    setFormData((prev) => ({
      ...prev,
      selectedParticipants: prev.selectedParticipants.some(
        (p) => p.id === friend.id
      )
        ? prev.selectedParticipants.filter((p) => p.id !== friend.id)
        : [...prev.selectedParticipants, friend],
    }));
  };

  const canProceedToNextStep = () => {
    if (currentStep === 1) {
      return (
        formData.name.trim() &&
        formData.tag.trim() &&
        validation.name.isValid &&
        validation.tag.isValid &&
        validation.description.isValid &&
        tagAvailable === true &&
        !isCheckingTag
      );
    }
    return true;
  };

  const handleNext = () => {
    if (canProceedToNextStep() && currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!canProceedToNextStep()) return;

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name);
      formDataToSend.append("tag", formData.tag);
      formDataToSend.append("description", formData.description);
      formDataToSend.append("type", type);

      if (formData.avatar) {
        formDataToSend.append("avatar", formData.avatar);
      }

      if (type === "chat" && formData.selectedParticipants.length > 0) {
        formDataToSend.append(
          "participants",
          JSON.stringify(formData.selectedParticipants.map((p) => p.id))
        );
      }

      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl(`/api/create-${type}`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formDataToSend,
      });

      let data = {};
      const contentType = response.headers.get("content-type") || "";
      try {
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = text ? { error: text } : {};
        }
      } catch {
        data = {};
      }

      if (response.ok) {
        // Redirect to the created chat/channel
        window.location.href = `/${type === "chat" ? "chat" : "channel"}/${
          formData.tag
        }`;
      } else {
        console.warn("Create failed:", { status: response.status, data });
        alert(
          data.error || `Ошибка создания ${type === "chat" ? "чата" : "канала"}`
        );
      }
    } catch (error) {
      console.error("Error:", error);
      alert(`Ошибка создания ${type === "chat" ? "чата" : "канала"}`);
    }
  };

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

  const generateTagSuggestions = () => {
    if (!formData.name) return [];

    const baseName = formData.name.toLowerCase().replace(/\s+/g, "");
    const suggestions = [
      baseName,
      `${baseName}_${type}`,
      `${baseName}123`,
      `my_${baseName}`,
    ];

    return suggestions.filter((tag) => tag.length >= 3 && tag.length <= 22);
  };

  const tagSuggestions = generateTagSuggestions();

  const invitePath = `/invite/${formData.tag}`;
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${invitePath}`
      : invitePath;

  return (
    <div className={styles.chatCreationZone}>
      <BackArrow />

      <div className={styles.header}>
        <h1>{type === "chat" ? "Создание чата" : "Создание канала"}</h1>
        {totalSteps > 1 && (
          <div className={styles.stepIndicator}>
            <span className={styles.stepText}>
              Шаг {currentStep} из {totalSteps}
            </span>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.content}>
        {currentStep === 1 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>
              <h2>Основная информация</h2>
              <p>
                Заполните основные данные для{" "}
                {type === "chat" ? "чата" : "канала"}
              </p>
            </div>

            <div className={styles.formLayout}>
              <div className={styles.avatarSection}>
                <div className={styles.avatarContainer}>
                  <input
                    id="avatar-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleAvatarChange(e.target.files[0])}
                    className={styles.hiddenInput}
                  />
                  <label htmlFor="avatar-input" className={styles.avatarLabel}>
                    <Image
                      src={edit_icon}
                      alt="Изменить аватар"
                      width={48}
                      height={48}
                      className={styles.avatarChangeIcon}
                    />
                  </label>

                  {avatarPreview ? (
                    <Image
                      src={avatarPreview}
                      alt="Avatar preview"
                      width={150}
                      height={150}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <div className={styles.avatarInitials}>
                      {formData.name?.trim()
                        ? generateInitials(formData.name.trim())
                        : "?"}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.fieldsSection}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Название <span style={{ color: "#ff6b6b" }}>*</span>
                  </label>
                  <input
                    className={`${styles.simpleInput} ${
                      !validation.name.isValid ? styles.error : ""
                    }`}
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder={`Название ${
                      type === "chat" ? "чата" : "канала"
                    }`}
                    maxLength={30}
                  />
                  {!validation.name.isValid && (
                    <div className={styles.fieldError}>
                      {validation.name.message}
                    </div>
                  )}
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Тег <span style={{ color: "#ff6b6b" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      className={`${styles.simpleInput} ${
                        !validation.tag.isValid
                          ? styles.error
                          : tagAvailable === true
                          ? styles.success
                          : ""
                      }`}
                      type="text"
                      value={formData.tag}
                      onChange={(e) => handleInputChange("tag", e.target.value)}
                      placeholder="unique_tag"
                      maxLength={22}
                      style={{ paddingLeft: "30px" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#888",
                        pointerEvents: "none",
                      }}
                    >
                      @
                    </span>
                  </div>
                  {!validation.tag.isValid && (
                    <div className={styles.fieldError}>
                      {validation.tag.message}
                    </div>
                  )}
                  {getTagStatus() && (
                    <div
                      className={`${styles.fieldStatus} ${
                        styles[getTagStatus().type]
                      }`}
                    >
                      {getTagStatus().message}
                    </div>
                  )}

                  {tagSuggestions.length > 0 && !formData.tag && (
                    <div className={styles.suggestions}>
                      <span className={styles.suggestionsLabel}>
                        Предложения:
                      </span>
                      <div className={styles.suggestionsList}>
                        {tagSuggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            className={styles.suggestionButton}
                            onClick={() => handleInputChange("tag", suggestion)}
                            type="button"
                          >
                            @{suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Описание{" "}
                    <span style={{ color: "#888", fontSize: "12px" }}>
                      (необязательно)
                    </span>
                  </label>
                  <textarea
                    className={`${styles.simpleTextarea} ${
                      !validation.description.isValid ? styles.error : ""
                    }`}
                    value={formData.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    placeholder={`Описание ${
                      type === "chat" ? "чата" : "канала"
                    }...`}
                    maxLength={200}
                    rows={3}
                  />
                  {!validation.description.isValid && (
                    <div className={styles.fieldError}>
                      {validation.description.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && type === "chat" && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>
              <h2>Добавить участников</h2>
              <p>Выберите друзей, которых хотите пригласить в чат</p>
            </div>

            <div className={styles.participantsSection}>
              {friendsList.length === 0 ? (
                <div className={styles.noFriends}>
                  <div className={styles.noFriendsIcon}>👥</div>
                  <p>У вас пока нет друзей для приглашения</p>
                  <small>Добавьте друзей в разделе &quot;Друзья&quot;</small>
                </div>
              ) : (
                <div className={styles.friendsList}>
                  {friendsList.map((friend) => (
                    <div
                      key={friend.id}
                      className={`${styles.friendItem} ${
                        formData.selectedParticipants.some(
                          (p) => p.id === friend.id
                        )
                          ? styles.selected
                          : ""
                      }`}
                      onClick={() => toggleParticipant(friend)}
                    >
                      <div className={styles.friendInfo}>
                        {friend.avatar ? (
                          <Image
                            src={friend.avatar}
                            alt={friend.name}
                            width={40}
                            height={40}
                            className={styles.friendAvatar}
                          />
                        ) : (
                          <div
                            className={styles.friendAvatarInitials}
                            aria-hidden="true"
                          >
                            {friend.name?.trim()
                              ? generateInitials(friend.name.trim())
                              : "?"}
                          </div>
                        )}
                        <div className={styles.friendDetails}>
                          <span className={styles.friendName}>
                            {friend.name}
                          </span>
                          <span className={styles.friendTag}>
                            @{friend.tag}
                          </span>
                        </div>
                      </div>
                      <div className={styles.checkbox}>
                        {formData.selectedParticipants.some(
                          (p) => p.id === friend.id
                        ) && <span className={styles.checkmark}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {formData.selectedParticipants.length > 0 && (
                <div className={styles.selectedCount}>
                  Выбрано участников: {formData.selectedParticipants.length}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 2 && type === "channel" && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>
              <h2>Ссылка для приглашения</h2>
              <p>Поделитесь этой ссылкой, чтобы пригласить людей в канал</p>
            </div>

            <div className={styles.inviteLinkSection}>
              <div className={styles.inviteLinkContainer}>
                <div className={styles.inviteLinkIcon}>🔗</div>
                <div className={styles.inviteLinkContent}>
                  <div className={styles.inviteLinkLabel}>
                    Ссылка приглашения:
                  </div>
                  <div className={styles.inviteLinkUrl}>
                    {inviteUrl}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl);
                    // Можно добавить уведомление о копировании
                  }}
                >
                  Копировать
                </button>
              </div>

              <div className={styles.inviteInfo}>
                <div className={styles.inviteInfoItem}>
                  <span className={styles.inviteInfoIcon}>👥</span>
                  <span className={styles.inviteInfoText}>
                    Любой, у кого есть эта ссылка, сможет присоединиться к
                    каналу
                  </span>
                </div>
                <div className={styles.inviteInfoItem}>
                  <span className={styles.inviteInfoIcon}>⚙️</span>
                  <span className={styles.inviteInfoText}>
                    Вы сможете управлять ссылкой в настройках канала после
                    создания
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {currentStep > 1 && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handlePrevious}
          >
            Назад
          </button>
        )}

        {currentStep < totalSteps ? (
          <button
            type="button"
            className={`${styles.primaryButton} ${
              !canProceedToNextStep() ? styles.disabled : ""
            }`}
            onClick={handleNext}
            disabled={!canProceedToNextStep()}
          >
            Далее
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.primaryButton} ${
              !canProceedToNextStep() ? styles.disabled : ""
            }`}
            onClick={handleSubmit}
            disabled={!canProceedToNextStep()}
          >
            Создать {type === "chat" ? "чат" : "канал"}
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatCreationZone;

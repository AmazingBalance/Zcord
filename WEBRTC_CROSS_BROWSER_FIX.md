# Улучшение кросс-браузерной совместимости WebRTC

## Описание проблемы

После исправления проблем с автоматическим присоединением к звонкам и улучшения передачи видео, была обнаружена проблема с кросс-браузерной совместимостью:

1. **Отсутствие передачи видео между разными браузерами**: При тестировании между Яндекс Браузером и Safari видео не передавалось, хотя таймер звонка синхронизировался.
2. **Проблемы с форматированием SDP**: Разные браузеры используют разные приоритеты кодеков в SDP, что может приводить к несовместимости.
3. **Различия в ограничениях медиа**: Разные браузеры имеют разные ограничения и требования к параметрам видео и аудио.

## Внесенные изменения

### 1. Добавление WebRTC адаптера

Добавлен пакет `webrtc-adapter`, который обеспечивает единый интерфейс WebRTC API для разных браузеров:

```javascript
import adapter from "webrtc-adapter";

// Логируем информацию об адаптере для отладки
webrtcLogger.persistLog("WebRTC adapter information:", {
  browser: adapter.browserDetails.browser,
  version: adapter.browserDetails.version,
  adapter: adapter.browserShim ? "loaded" : "not loaded",
});
```

### 2. Расширенная конфигурация ICE серверов

Добавлены дополнительные STUN и TURN серверы для улучшения прохождения NAT:

```javascript
this.rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Дополнительные STUN серверы
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Публичные TURN серверы
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  sdpSemantics: "unified-plan",
};
```

### 3. Предпочтение H.264 кодека для лучшей совместимости

Добавлен метод для модификации SDP, чтобы H.264 кодек был в приоритете (особенно важно для Safari):

```javascript
preferH264(sdp) {
  // Находим видео секцию в SDP
  const videoSections = sdp.split('m=video');
  if (videoSections.length <= 1) {
    return sdp; // Нет видео секции
  }

  // Находим строки с H.264 кодеком
  // ...

  // Модифицируем SDP, чтобы H.264 был первым в списке кодеков
  // ...

  return modifiedSdp;
}
```

### 4. Адаптивные ограничения медиа для разных браузеров

Добавлены специфичные настройки видео для разных браузеров:

```javascript
// Адаптивные ограничения для разных браузеров
let videoConstraints = false;
if (callState.callType === "video") {
  const browser = browserSupport.details.browser;

  // Базовые ограничения для видео
  videoConstraints = {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    frameRate: { ideal: 30, min: 15 },
  };

  // Специфичные настройки для Safari
  if (browser === "safari") {
    videoConstraints = {
      width: { ideal: 1280, min: 320 },
      height: { ideal: 720, min: 240 },
      frameRate: { max: 30 },
    };
  }

  // Специфичные настройки для Firefox
  else if (browser === "firefox") {
    videoConstraints = {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 360 },
      frameRate: { ideal: 24, min: 15 },
    };
  }
}
```

### 5. Проверка поддержки WebRTC в браузере

Добавлен метод для проверки поддержки WebRTC в браузере:

```javascript
checkBrowserSupport() {
  const result = {
    supported: true,
    details: {
      browser: adapter.browserDetails.browser,
      version: adapter.browserDetails.version,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      RTCPeerConnection: !!window.RTCPeerConnection,
      RTCSessionDescription: !!window.RTCSessionDescription,
      RTCIceCandidate: !!window.RTCIceCandidate
    }
  };

  // Проверяем основные компоненты WebRTC
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    result.supported = false;
    result.error = "getUserMedia не поддерживается";
  } else if (!window.RTCPeerConnection) {
    result.supported = false;
    result.error = "RTCPeerConnection не поддерживается";
  }

  return result;
}
```

## Ожидаемые результаты

- Улучшение совместимости между разными браузерами (Chrome, Firefox, Safari, Яндекс Браузер)
- Более надежное установление соединения через NAT благодаря дополнительным STUN/TURN серверам
- Лучшая совместимость видеокодеков между браузерами благодаря предпочтению H.264
- Адаптивные ограничения медиа для разных браузеров

## Рекомендации по тестированию

1. **Тестирование между разными браузерами**:

   - Chrome и Firefox
   - Chrome и Safari
   - Firefox и Safari
   - Яндекс Браузер и Safari

2. **Тестирование в разных сетевых условиях**:

   - За NAT (домашний роутер)
   - В корпоративной сети с файрволом
   - Через мобильную сеть

3. **Проверка качества видео и аудио**:
   - Проверить, что видео передается без искажений
   - Проверить синхронизацию аудио и видео
   - Проверить задержку передачи

## Дополнительные рекомендации

1. **Мониторинг WebRTC соединений**:

   - Добавить сбор статистики о качестве соединения (RTCPeerConnection.getStats())
   - Отслеживать потерю пакетов, задержку и джиттер

2. **Адаптивное качество видео**:

   - Реализовать динамическое изменение качества видео в зависимости от пропускной способности сети
   - Использовать simulcast для отправки нескольких потоков разного качества

3. **Резервные TURN серверы**:
   - Настроить собственные TURN серверы для более надежного соединения
   - Реализовать автоматическое переключение между TURN серверами при проблемах с соединением

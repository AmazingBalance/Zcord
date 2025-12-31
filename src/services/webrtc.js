import { websocketService } from "./websocket";
import { webrtcLogger } from "../utils/logger";
import adapter from "webrtc-adapter";

// Логируем информацию об адаптере для отладки
webrtcLogger.persistLog("WebRTC adapter information:", {
  browser: adapter.browserDetails.browser,
  version: adapter.browserDetails.version,
  adapter: adapter.browserShim ? "loaded" : "not loaded",
});

class WebRTCService {
  constructor() {
    this.peerConnections = new Map();
    this.localStream = null;
    this.screenStream = null;
    this.pendingIceCandidates = new Map(); // peerId(string) -> RTCIceCandidateInit[]
    this.remoteStreams = new Map(); // peerId(string) -> MediaStream
    this.initiatorPeers = new Set(); // peerId(string) where we create offers
    this.negotiationInProgress = new Set(); // peerId(string)
    this.pendingNegotiations = new Map(); // peerId(string) -> { force: boolean, attempts: number }
    this.pendingNegotiationTimers = new Map(); // peerId(string) -> timeout id
    this.disconnectTimers = new Map(); // peerId(string) -> timeout id
    this.currentCallType = null; // 'video' | 'audio'
    this.currentChatType = null;
    this.currentParticipants = null;
    this.screenShareSendersByPeerId = new Map(); // peerId(string) -> RTCRtpSender[]
    // Расширенная конфигурация для кросс-браузерной совместимости
    this.rtcConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        // Добавляем публичные TURN серверы для обхода симметричных NAT
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

    // Добавляем отслеживание последнего выхода из звонка
    this.lastCallEndTime = 0;
    this.currentChatId = null;

    this.setupWebSocketHandlers();

    websocketService.addEventListener("onConnect", () => {
      try {
        this.handleWebSocketReconnect();
      } catch (e) {
        webrtcLogger.error("[WebRTC] Error handling WS reconnect:", e);
      }
    });
  }

  normalizePeerId(id) {
    if (id === null || id === undefined) return null;
    return String(id);
  }

  serializeSessionDescription(desc) {
    if (!desc) return desc;
    const type = desc.type ?? desc?.data?.type;
    const sdp = desc.sdp ?? desc?.data?.sdp;
    if (typeof type === "string" && typeof sdp === "string") return { type, sdp };
    return desc;
  }

  serializeIceCandidate(candidate) {
    if (!candidate) return candidate;
    if (typeof candidate.toJSON === "function") return candidate.toJSON();

    const maybe = candidate?.candidate ? candidate : candidate?.data;
    if (!maybe) return candidate;

    const { candidate: c, sdpMid, sdpMLineIndex, usernameFragment } = maybe;
    if (typeof c === "string") {
      return {
        candidate: c,
        sdpMid: sdpMid ?? null,
        sdpMLineIndex: sdpMLineIndex ?? null,
        usernameFragment: usernameFragment ?? null,
      };
    }

    return candidate;
  }

  queueIceCandidate(peerId, candidate) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId || !candidate) return;

    const list = this.pendingIceCandidates.get(normalizedPeerId) || [];
    list.push(candidate);
    this.pendingIceCandidates.set(normalizedPeerId, list);
  }

  async flushPendingIceCandidates(peerId) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;

    const peerConnection = this.peerConnections.get(normalizedPeerId);
    if (!peerConnection) return;

    if (!peerConnection.remoteDescription) return;

    const list = this.pendingIceCandidates.get(normalizedPeerId);
    if (!list || list.length === 0) return;

    this.pendingIceCandidates.delete(normalizedPeerId);

    for (const candidate of list) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        webrtcLogger.log(`Flushed ICE candidate for ${normalizedPeerId}`);
      } catch (error) {
        webrtcLogger.error(
          `Error flushing ICE candidate for ${normalizedPeerId}:`,
          error
        );
      }
    }
  }

  setupWebSocketHandlers() {
    // Listen for WebRTC signaling messages
    websocketService.onMessage("webrtc_offer", this.handleOffer.bind(this));
    websocketService.onMessage("webrtc_answer", this.handleAnswer.bind(this));
    websocketService.onMessage(
      "webrtc_ice_candidate",
      this.handleIceCandidate.bind(this)
    );
    websocketService.onMessage(
      "webrtc_user_joined",
      this.handleUserJoined.bind(this)
    );
    websocketService.onMessage(
      "webrtc_user_left",
      this.handleUserLeft.bind(this)
    );
    websocketService.onMessage(
      "webrtc_screen_share_started",
      this.handleScreenShareStarted.bind(this)
    );
    websocketService.onMessage(
      "webrtc_screen_share_stopped",
      this.handleScreenShareStopped.bind(this)
    );
  }

  async maybeNegotiate(peerId, options = {}) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;
    const force = !!options?.force;
    if (!force && !this.initiatorPeers.has(normalizedPeerId)) return;
    if (this.negotiationInProgress.has(normalizedPeerId)) {
      this.markPendingNegotiation(normalizedPeerId, { force });
      return;
    }

    const peerConnection = this.peerConnections.get(normalizedPeerId);
    if (!peerConnection) return;
    if (peerConnection.signalingState !== "stable") {
      this.markPendingNegotiation(normalizedPeerId, { force });
      return;
    }

    if (!this.localStream || this.localStream.getTracks().length === 0) {
      webrtcLogger.warn(
        `Skipping negotiation for ${normalizedPeerId}: no local stream yet`
      );
      this.markPendingNegotiation(normalizedPeerId, { force });
      return;
    }

    // If this is a video call but we don't have a local video track, we still want to receive video.
    if (this.currentCallType === "video") {
      const hasVideoSender = peerConnection
        .getSenders()
        .some((s) => s.track && s.track.kind === "video");
      if (!hasVideoSender) {
        try {
          peerConnection.addTransceiver("video", { direction: "recvonly" });
        } catch {
          // ignore
        }
      }
    }

    this.pendingNegotiations.delete(normalizedPeerId);
    this.negotiationInProgress.add(normalizedPeerId);
    try {
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.currentCallType === "video",
        voiceActivityDetection: true,
      };

      const offer = await peerConnection.createOffer(offerOptions);

      let modifiedSdp = offer.sdp;
      if (modifiedSdp && modifiedSdp.includes("m=video")) {
        modifiedSdp = this.preferH264(modifiedSdp);
      }

      const originalOffer = offer;
      let localOffer =
        typeof modifiedSdp === "string" && modifiedSdp !== offer.sdp
          ? { type: offer.type, sdp: modifiedSdp }
          : offer;

      try {
        await peerConnection.setLocalDescription(localOffer);
      } catch (e) {
        const message = String(e?.message || "");
        const isInvalidModification =
          e?.name === "InvalidModificationError" ||
          message.includes("SDP is modified");

        if (isInvalidModification && localOffer !== originalOffer) {
          webrtcLogger.warn(
            `SDP munging rejected for ${normalizedPeerId}, retrying with original offer`
          );
          localOffer = originalOffer;
          await peerConnection.setLocalDescription(originalOffer);
        } else {
          throw e;
        }
      }
      webrtcLogger.log(
        `Created and set local offer for ${normalizedPeerId}:`,
        localOffer
      );

      websocketService.send({
        type: "webrtc_offer",
        data: {
          targetUserId: normalizedPeerId,
          offer: this.serializeSessionDescription(localOffer),
        },
      });
    } catch (error) {
      webrtcLogger.error(`Error negotiating with ${normalizedPeerId}:`, error);
    } finally {
      this.negotiationInProgress.delete(normalizedPeerId);
      this.drainPendingNegotiation(normalizedPeerId);
    }
  }

  markPendingNegotiation(peerId, options = {}) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;

    const prev = this.pendingNegotiations.get(normalizedPeerId);
    const force = !!options?.force || !!prev?.force;
    const attempts = Number.isFinite(prev?.attempts) ? prev.attempts : 0;

    this.pendingNegotiations.set(normalizedPeerId, { force, attempts });
    this.schedulePendingNegotiationDrain(normalizedPeerId);
  }

  schedulePendingNegotiationDrain(peerId, delayMs = 250) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;
    if (this.pendingNegotiationTimers.has(normalizedPeerId)) return;

    const handle = setTimeout(() => {
      this.pendingNegotiationTimers.delete(normalizedPeerId);
      this.drainPendingNegotiation(normalizedPeerId);
    }, delayMs);

    this.pendingNegotiationTimers.set(normalizedPeerId, handle);
  }

  drainPendingNegotiation(peerId) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;

    const pending = this.pendingNegotiations.get(normalizedPeerId);
    if (!pending) return;

    const peerConnection = this.peerConnections.get(normalizedPeerId);
    if (!peerConnection) {
      this.pendingNegotiations.delete(normalizedPeerId);
      return;
    }

    if (this.negotiationInProgress.has(normalizedPeerId)) {
      this.schedulePendingNegotiationDrain(normalizedPeerId, 250);
      return;
    }

    if (peerConnection.signalingState !== "stable") {
      this.schedulePendingNegotiationDrain(normalizedPeerId, 250);
      return;
    }

    this.pendingNegotiations.delete(normalizedPeerId);
    try {
      this.maybeNegotiate(normalizedPeerId, { force: !!pending.force });
    } catch {
      // ignore
    }
  }

  clearDisconnectTimer(peerId) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;
    const handle = this.disconnectTimers.get(normalizedPeerId);
    if (handle) {
      clearTimeout(handle);
    }
    this.disconnectTimers.delete(normalizedPeerId);
  }

  scheduleDisconnectTimer(peerId, delayMs = 10000) {
    const normalizedPeerId = this.normalizePeerId(peerId);
    if (!normalizedPeerId) return;
    if (this.disconnectTimers.has(normalizedPeerId)) return;

    const handle = setTimeout(() => {
      this.disconnectTimers.delete(normalizedPeerId);

      const peerConnection = this.peerConnections.get(normalizedPeerId);
      if (!peerConnection) {
        this.onUserDisconnected?.(normalizedPeerId);
        return;
      }

      const state = peerConnection.connectionState;
      if (state === "connected") return;
      if (state === "connecting" || state === "new") {
        this.scheduleDisconnectTimer(normalizedPeerId, delayMs);
        return;
      }

      try {
        peerConnection.close();
      } catch {
        // ignore
      }

      this.peerConnections.delete(normalizedPeerId);
      this.pendingIceCandidates.delete(normalizedPeerId);
      this.remoteStreams.delete(normalizedPeerId);
      this.initiatorPeers.delete(normalizedPeerId);
      this.negotiationInProgress.delete(normalizedPeerId);
      this.pendingNegotiations.delete(normalizedPeerId);
      this.screenShareSendersByPeerId.delete(normalizedPeerId);

      const negTimer = this.pendingNegotiationTimers.get(normalizedPeerId);
      if (negTimer) clearTimeout(negTimer);
      this.pendingNegotiationTimers.delete(normalizedPeerId);

      this.onUserDisconnected?.(normalizedPeerId);
    }, delayMs);

    this.disconnectTimers.set(normalizedPeerId, handle);
  }

  async createPeerConnection(userId, isInitiator = false) {
    const normalizedUserId = this.normalizePeerId(userId);
    const existingPeerConnection = this.peerConnections.get(normalizedUserId);
    if (existingPeerConnection) {
      const shouldRecreate =
        existingPeerConnection.connectionState === "closed" ||
        existingPeerConnection.connectionState === "failed" ||
        existingPeerConnection.signalingState === "closed";

      if (!shouldRecreate) {
        return existingPeerConnection;
      }

      webrtcLogger.persistLog(
        `Recreating stale peer connection for user ${normalizedUserId}`,
        {
          connectionState: existingPeerConnection.connectionState,
          iceConnectionState: existingPeerConnection.iceConnectionState,
          signalingState: existingPeerConnection.signalingState,
        }
      );

      try {
        existingPeerConnection.close();
      } catch {
        // ignore
      }

      this.peerConnections.delete(normalizedUserId);
      this.pendingIceCandidates.delete(normalizedUserId);
      this.remoteStreams.delete(normalizedUserId);
      this.initiatorPeers.delete(normalizedUserId);
      this.negotiationInProgress.delete(normalizedUserId);
      this.pendingNegotiations.delete(normalizedUserId);
      this.screenShareSendersByPeerId.delete(normalizedUserId);

      const negTimer = this.pendingNegotiationTimers.get(normalizedUserId);
      if (negTimer) clearTimeout(negTimer);
      this.pendingNegotiationTimers.delete(normalizedUserId);

      this.clearDisconnectTimer(normalizedUserId);
    }
    webrtcLogger.persistLog(
      `Creating peer connection for user ${normalizedUserId}, isInitiator: ${isInitiator}`
    );

    try {
      // Расширенная конфигурация для улучшения соединения
      const enhancedConfig = {
        ...this.rtcConfiguration,
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        sdpSemantics: "unified-plan",
        // Дополнительные STUN/TURN серверы для лучшей работы через NAT
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
      };

      const peerConnection = new RTCPeerConnection(enhancedConfig);
      this.peerConnections.set(normalizedUserId, peerConnection);
      if (isInitiator) this.initiatorPeers.add(normalizedUserId);

      // Добавляем локальные треки в соединение
      if (this.localStream) {
        webrtcLogger.log("Adding local tracks to peer connection");

        // Получаем список треков
        const tracks = this.localStream.getTracks();
        webrtcLogger.log(
          `Local stream has ${tracks.length} tracks:`,
          tracks.map((t) => ({ kind: t.kind, enabled: t.enabled, id: t.id }))
        );

        // Добавляем каждый трек в соединение
        tracks.forEach((track) => {
          try {
            const sender = peerConnection.addTrack(track, this.localStream);
            webrtcLogger.log(`Added ${track.kind} track to peer connection:`, {
              trackId: track.id,
              enabled: track.enabled,
              sender: sender ? "created" : "failed",
            });
          } catch (e) {
            webrtcLogger.error(`Error adding track to peer connection:`, e);
          }
        });
      } else {
        webrtcLogger.warn(
          "No local stream available when creating peer connection"
        );
      }

      // Обработка удаленного потока
      // Add active screen share tracks (if any) as a separate stream.
      if (this.screenStream) {
        webrtcLogger.log("Adding screen share tracks to peer connection");

        const screenTracks = this.screenStream.getTracks();
        const screenSenders = [];

        screenTracks.forEach((track) => {
          try {
            const sender = peerConnection.addTrack(track, this.screenStream);
            if (sender) screenSenders.push(sender);
            webrtcLogger.log(
              `Added screen ${track.kind} track to peer connection:`,
              {
                trackId: track.id,
                enabled: track.enabled,
                sender: sender ? "created" : "failed",
              }
            );
          } catch (e) {
            webrtcLogger.error(`Error adding screen track to peer connection:`, e);
          }
        });

        if (screenSenders.length > 0) {
          this.screenShareSendersByPeerId.set(normalizedUserId, screenSenders);
        }
      }

      peerConnection.ontrack = (event) => {
        try {
          const remoteStreamFromEvent = event.streams && event.streams[0];
          const remoteStream =
            remoteStreamFromEvent ||
            this.remoteStreams.get(normalizedUserId) ||
            new MediaStream();

          if (!this.remoteStreams.has(normalizedUserId)) {
            this.remoteStreams.set(normalizedUserId, remoteStream);
          }

          if (event.track) {
            const alreadyHasTrack = remoteStream
              .getTracks()
              .some((t) => t.id === event.track.id);
            if (!alreadyHasTrack) {
              remoteStream.addTrack(event.track);
            }

            event.track.onended = () => {
              try {
                remoteStream.removeTrack(event.track);
              } catch {
                // ignore
              }
            };
          }

          // Анализ треков в потоке
          const videoTracks = remoteStream.getVideoTracks();
          const audioTracks = remoteStream.getAudioTracks();

          webrtcLogger.persistLog("Stream tracks analysis:", {
            userId: normalizedUserId,
            hasVideoTracks: videoTracks.length > 0,
            videoTracksCount: videoTracks.length,
            hasAudioTracks: audioTracks.length > 0,
            audioTracksCount: audioTracks.length,
            videoTracks: videoTracks.map((t) => ({
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState,
              id: t.id,
            })),
            audioTracks: audioTracks.map((t) => ({
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState,
              id: t.id,
            })),
          });

          webrtcLogger.persistLog(`Received remote track from ${normalizedUserId}:`, {
            kind: event.track.kind,
            id: event.track.id,
            enabled: event.track.enabled,
            readyState: event.track.readyState,
            streamId: remoteStream.id,
            streamActive: remoteStream.active,
            streamTracks: remoteStream.getTracks().length,
          });

          // Вызываем колбэк с удаленным потоком
          if (this.onRemoteStream) {
            this.onRemoteStream(normalizedUserId, remoteStream);
          } else {
            webrtcLogger.warn(
              `onRemoteStream callback not set when receiving track from ${normalizedUserId}`
            );
          }
        } catch (e) {
          webrtcLogger.error(`Error handling ontrack event:`, e);
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          webrtcLogger.log(
            `Generated ICE candidate for ${normalizedUserId}:`,
            event.candidate
          );
          websocketService.send({
            type: "webrtc_ice_candidate",
            data: {
              targetUserId: normalizedUserId,
              candidate: this.serializeIceCandidate(event.candidate),
            },
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        webrtcLogger.persistLog(
          `Connection state for ${normalizedUserId}:`,
          state
        );

        if (state === "connected") {
          this.clearDisconnectTimer(normalizedUserId);
          return;
        }

        if (state === "failed") {
          webrtcLogger.error(`Connection failed for user ${normalizedUserId}`);
          this.scheduleDisconnectTimer(normalizedUserId, 4000);
          return;
        }

        if (state === "disconnected") {
          webrtcLogger.warn(`Connection disconnected for user ${normalizedUserId}`);
          this.scheduleDisconnectTimer(normalizedUserId, 10000);
          return;
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        webrtcLogger.log(
          `ICE connection state for ${normalizedUserId}:`,
          iceState
        );
        if (iceState === "connected" || iceState === "completed") {
          this.clearDisconnectTimer(normalizedUserId);
          return;
        }

        if (iceState === "failed" || iceState === "disconnected") {
          webrtcLogger.error(`ICE connection failed for user ${normalizedUserId}`);
          // Try to restart ICE
          if (isInitiator) {
            this.restartIce(normalizedUserId);
          } else {
            this.maybeNegotiate(normalizedUserId, { force: true });
          }

          this.scheduleDisconnectTimer(normalizedUserId, 10000);
        }
      };

      // Handle ICE gathering state changes
      peerConnection.onicegatheringstatechange = () => {
        webrtcLogger.log(
          `ICE gathering state for ${normalizedUserId}:`,
          peerConnection.iceGatheringState
        );
      };

      // Handle signaling state changes
      peerConnection.onsignalingstatechange = () => {
        webrtcLogger.log(
          `Signaling state for ${normalizedUserId}:`,
          peerConnection.signalingState
        );
        if (peerConnection.signalingState === "stable") {
          this.drainPendingNegotiation(normalizedUserId);
        }
      };

      peerConnection.onnegotiationneeded = () => {
        try {
          this.maybeNegotiate(normalizedUserId);
        } catch {
          // ignore
        }
      };

      // If we're the initiator, create and send offer
      if (isInitiator) {
        if (!this.localStream || this.localStream.getTracks().length === 0) {
          webrtcLogger.warn(
            `No local stream available for initiator ${normalizedUserId}; delaying offer`
          );
        } else {
          try {
          // Создаем оффер с опциями для улучшения совместимости
          const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.currentCallType === "video",
            voiceActivityDetection: true,
          };

          const offer = await peerConnection.createOffer(offerOptions);

          // Модифицируем SDP для лучшей совместимости
          let modifiedSdp = offer.sdp;

          // Добавляем H.264 в начало списка видеокодеков для лучшей совместимости с Safari
          if (modifiedSdp && modifiedSdp.includes("m=video")) {
            modifiedSdp = this.preferH264(modifiedSdp);
          }

          // Создаем новый объект с модифицированным SDP
          const originalOffer = offer;
          let localOffer =
            typeof modifiedSdp === "string" && modifiedSdp !== offer.sdp
              ? { type: offer.type, sdp: modifiedSdp }
              : offer;

          try {
            await peerConnection.setLocalDescription(localOffer);
          } catch (e) {
            const message = String(e?.message || "");
            const isInvalidModification =
              e?.name === "InvalidModificationError" ||
              message.includes("SDP is modified");

            if (isInvalidModification && localOffer !== originalOffer) {
              webrtcLogger.warn(
                `SDP munging rejected for ${normalizedUserId}, retrying with original offer`
              );
              localOffer = originalOffer;
              await peerConnection.setLocalDescription(originalOffer);
            } else {
              throw e;
            }
          }
          webrtcLogger.log(
            `Created and set local offer for ${normalizedUserId}:`,
            localOffer
          );

          websocketService.send({
            type: "webrtc_offer",
            data: {
              targetUserId: normalizedUserId,
              offer: this.serializeSessionDescription(localOffer),
            },
          });
        } catch (error) {
          webrtcLogger.error("Error creating offer:", error);
        }
        }
      }

      await this.flushPendingIceCandidates(normalizedUserId);

      return peerConnection;
    } catch (error) {
      webrtcLogger.error(
        `Error creating peer connection for user ${normalizedUserId}:`,
        error
      );
      throw error;
    }
  }

  // Add a method to restart ICE
  async restartIce(userId) {
    const normalizedUserId = this.normalizePeerId(userId);
    webrtcLogger.persistLog(`Restarting ICE for user ${normalizedUserId}`);

    const peerConnection = this.peerConnections.get(normalizedUserId);
    if (!peerConnection) {
      webrtcLogger.warn(`No peer connection found for user ${normalizedUserId}`);
      return;
    }

    try {
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);
      webrtcLogger.log(`Created ICE restart offer for ${normalizedUserId}:`, offer);

      websocketService.send({
        type: "webrtc_offer",
        data: {
          targetUserId: normalizedUserId,
          offer: this.serializeSessionDescription(offer),
        },
      });

      webrtcLogger.log(`ICE restart offer sent for user ${normalizedUserId}`);
    } catch (error) {
      webrtcLogger.error(`Error restarting ICE for user ${normalizedUserId}:`, error);
    }
  }

  async handleOffer(data) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // ignore
      }
    }

    const payload = data?.data ?? data;
    const { fromUserId, offer } = payload ?? {};
    const normalizedFromUserId = this.normalizePeerId(fromUserId);
    webrtcLogger.persistLog(`Handling offer from ${normalizedFromUserId}:`, offer);

    try {
      const peerConnection = await this.createPeerConnection(
        normalizedFromUserId,
        false
      );
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      webrtcLogger.log(`Set remote description for ${normalizedFromUserId}`);
      await this.flushPendingIceCandidates(normalizedFromUserId);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      webrtcLogger.log(
        `Created and set local answer for ${normalizedFromUserId}:`,
        answer
      );

      websocketService.send({
        type: "webrtc_answer",
        data: {
          targetUserId: normalizedFromUserId,
          answer: this.serializeSessionDescription(answer),
        },
      });
    } catch (error) {
      webrtcLogger.error("Error handling offer:", error);
    }
  }

  async handleAnswer(data) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // ignore
      }
    }

    const payload = data?.data ?? data;
    const { fromUserId, answer } = payload ?? {};
    const normalizedFromUserId = this.normalizePeerId(fromUserId);
    webrtcLogger.persistLog(`Handling answer from ${normalizedFromUserId}:`, answer);
    const peerConnection = this.peerConnections.get(normalizedFromUserId);

    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        webrtcLogger.log(
          `Set remote description (answer) for ${normalizedFromUserId}`
        );
        await this.flushPendingIceCandidates(normalizedFromUserId);
      } catch (error) {
        webrtcLogger.error("Error handling answer:", error);
      }
    } else {
      webrtcLogger.warn(`No peer connection found for ${normalizedFromUserId}`);
    }
  }

  async handleIceCandidate(data) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // ignore
      }
    }

    const payload = data?.data ?? data;
    const { fromUserId, candidate } = payload ?? {};
    const normalizedFromUserId = this.normalizePeerId(fromUserId);
    webrtcLogger.persistLog(
      `Handling ICE candidate from ${normalizedFromUserId}:`,
      candidate
    );
    const peerConnection = this.peerConnections.get(normalizedFromUserId);

    if (peerConnection) {
      if (!peerConnection.remoteDescription) {
        this.queueIceCandidate(normalizedFromUserId, candidate);
        webrtcLogger.log(
          `Queued ICE candidate for ${normalizedFromUserId} (remoteDescription not set yet)`
        );
        return;
      }
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        webrtcLogger.log(`Added ICE candidate for ${normalizedFromUserId}`);
      } catch (error) {
        webrtcLogger.error("Error adding ICE candidate:", error);
      }
    } else {
      // ICE can arrive before offer/user_joined; create a responder PC so we can attach once offer arrives.
      try {
        this.createPeerConnection(normalizedFromUserId, false);
      } catch {
        // ignore
      }
      this.queueIceCandidate(normalizedFromUserId, candidate);
      webrtcLogger.warn(
        `No peer connection found for ${normalizedFromUserId}, queued ICE candidate`
      );
    }
  }

  handleUserJoined(data) {
    // Проверяем структуру данных и извлекаем нужные поля
    let fromUserId, globalStartTime, callId;

    try {
      // Безопасно извлекаем данные, проверяя все возможные структуры
      if (typeof data === "string") {
        // Если данные пришли как строка, пробуем распарсить JSON
        try {
          const parsedData = JSON.parse(data);
          data = parsedData;
        } catch (e) {
          webrtcLogger.error(
            "Failed to parse JSON in handleUserJoined:",
            e,
            data
          );
        }
      }

      if (data.data) {
        // Если данные в поле data
        fromUserId = data.data.fromUserId;
        globalStartTime = data.data.globalStartTime;
        callId = data.data.callId;
      } else {
        // Если данные на верхнем уровне
        fromUserId = data.fromUserId;
        globalStartTime = data.globalStartTime;
        callId = data.callId;
      }

      webrtcLogger.persistLog(`User ${fromUserId} joined the call`, data);
    } catch (error) {
      webrtcLogger.error(
        "Error parsing data in handleUserJoined:",
        error,
        data
      );
      return; // Прерываем выполнение в случае ошибки
    }

    // Update global call start time if provided
    if (globalStartTime && this.onCallStartTimeUpdate) {
      webrtcLogger.persistLog("Received global call start time:", {
        globalStartTime,
        asDate: new Date(globalStartTime).toISOString(),
      });
      this.onCallStartTimeUpdate(globalStartTime);
    }

    // Update call ID if provided
    if (callId && this.onCallIdUpdate) {
      this.onCallIdUpdate(callId);
    }

    // Ignore self messages (server broadcasts join to everyone, including the sender)
    if (fromUserId && String(fromUserId) === String(websocketService.userId)) {
      return;
    }

    // Create peer connection as initiator for new user
    if (fromUserId) {
      const normalizedFromUserId = this.normalizePeerId(fromUserId);
      const localUserId = Number(this.normalizePeerId(websocketService.userId));
      const remoteUserId = Number(normalizedFromUserId);
      const shouldInitiateOffer =
        Number.isFinite(localUserId) && Number.isFinite(remoteUserId)
          ? localUserId < remoteUserId
          : true;

      this.createPeerConnection(normalizedFromUserId, shouldInitiateOffer);

      // Notify about new participant
      if (this.onParticipantJoined) {
        this.onParticipantJoined(normalizedFromUserId);
      }

      // If we're currently screen sharing, notify the newly joined peer so the initiator can
      // renegotiate and include the screen transceiver(s) (answers can't add new m-lines).
      if (this.screenStream && this.currentChatId) {
        try {
          websocketService.send({
            type: "webrtc_screen_share_started",
            data: { chatId: String(this.currentChatId) },
          });
        } catch {
          // ignore
        }
      }
    } else {
      webrtcLogger.error("Missing fromUserId in handleUserJoined", data);
    }
  }

  handleUserLeft(data) {
    // Проверяем структуру данных и извлекаем нужные поля
    let fromUserId;

    try {
      // Безопасно извлекаем данные, проверяя все возможные структуры
      if (typeof data === "string") {
        // Если данные пришли как строка, пробуем распарсить JSON
        try {
          const parsedData = JSON.parse(data);
          data = parsedData;
        } catch (e) {
          webrtcLogger.error(
            "Failed to parse JSON in handleUserLeft:",
            e,
            data
          );
        }
      }

      if (data.data) {
        // Если данные в поле data
        fromUserId = data.data.fromUserId;
      } else {
        // Если данные на верхнем уровне
        fromUserId = data.fromUserId;
      }

      webrtcLogger.persistLog(`User ${fromUserId} left the call`, data);
    } catch (error) {
      webrtcLogger.error("Error parsing data in handleUserLeft:", error, data);
      return; // Прерываем выполнение в случае ошибки
    }

    if (fromUserId) {
      if (String(fromUserId) === String(websocketService.userId)) {
        return;
      }
      const normalizedFromUserId = this.normalizePeerId(fromUserId);
      const peerConnection = this.peerConnections.get(normalizedFromUserId);
      if (peerConnection) {
        peerConnection.close();
        webrtcLogger.log(`Closed peer connection for ${normalizedFromUserId}`);
      }

      this.peerConnections.delete(normalizedFromUserId);
      this.pendingIceCandidates.delete(normalizedFromUserId);
      this.remoteStreams.delete(normalizedFromUserId);
      this.initiatorPeers.delete(normalizedFromUserId);
      this.negotiationInProgress.delete(normalizedFromUserId);
      this.pendingNegotiations.delete(normalizedFromUserId);
      const negTimer = this.pendingNegotiationTimers.get(normalizedFromUserId);
      if (negTimer) clearTimeout(negTimer);
      this.pendingNegotiationTimers.delete(normalizedFromUserId);
      this.clearDisconnectTimer(normalizedFromUserId);
      this.screenShareSendersByPeerId.delete(normalizedFromUserId);
      this.onUserDisconnected?.(normalizedFromUserId);
    } else {
      webrtcLogger.error("Missing fromUserId in handleUserLeft", data);
    }
  }

  handleScreenShareStarted(data) {
    const payload = data?.data ?? data;
    const normalizedFromUserId = this.normalizePeerId(payload?.fromUserId);
    const chatId = payload?.chatId;

    if (!normalizedFromUserId) return;
    if (
      String(normalizedFromUserId) ===
      String(this.normalizePeerId(websocketService.userId))
    ) {
      return;
    }
    if (this.currentChatId && chatId && String(chatId) !== String(this.currentChatId)) {
      return;
    }

    // Initiator should renegotiate to pull in the new screen track(s).
    if (this.peerConnections.has(normalizedFromUserId)) {
      this.maybeNegotiate(normalizedFromUserId);
    } else {
      setTimeout(() => {
        if (this.peerConnections.has(normalizedFromUserId)) {
          this.maybeNegotiate(normalizedFromUserId);
        }
      }, 500);
    }
  }

  handleScreenShareStopped(data) {
    const payload = data?.data ?? data;
    const normalizedFromUserId = this.normalizePeerId(payload?.fromUserId);
    const chatId = payload?.chatId;

    if (!normalizedFromUserId) return;
    if (
      String(normalizedFromUserId) ===
      String(this.normalizePeerId(websocketService.userId))
    ) {
      return;
    }
    if (this.currentChatId && chatId && String(chatId) !== String(this.currentChatId)) {
      return;
    }

    // Initiator should renegotiate to cleanly remove the screen track(s).
    if (this.peerConnections.has(normalizedFromUserId)) {
      this.maybeNegotiate(normalizedFromUserId);
    }
  }

  setLocalStream(stream) {
    webrtcLogger.persistLog("Setting local stream:", {
      id: stream.id,
      active: stream.active,
      tracks: stream.getTracks().map((track) => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        id: track.id,
        constraints: track.getConstraints(),
      })),
    });

    // Подробный анализ видео и аудио треков
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    webrtcLogger.persistLog("Stream tracks analysis:", {
      hasVideoTracks: videoTracks.length > 0,
      videoTracksCount: videoTracks.length,
      hasAudioTracks: audioTracks.length > 0,
      audioTracksCount: audioTracks.length,
    });

    // Анализ видеотреков
    if (videoTracks.length > 0) {
      webrtcLogger.log(
        "Video tracks:",
        videoTracks.map((track) => ({
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          constraints: track.getConstraints(),
          settings: track.getSettings(),
        }))
      );
    } else {
      webrtcLogger.warn("No video tracks found in stream");
    }

    // Анализ аудиотреков
    if (audioTracks.length > 0) {
      webrtcLogger.log(
        "Audio tracks:",
        audioTracks.map((track) => ({
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          constraints: track.getConstraints(),
          settings: track.getSettings(),
        }))
      );
    } else {
      webrtcLogger.warn("No audio tracks found in stream");
    }

    // Сохраняем локальный поток
    this.localStream = stream;

    // Добавляем треки к существующим peer connections
    this.peerConnections.forEach((peerConnection, userId) => {
      webrtcLogger.log(
        `Adding tracks to existing peer connection for ${userId}`
      );

      // Получаем список существующих отправителей
      const existingSenders = peerConnection.getSenders();
      webrtcLogger.log(
        `Existing senders for ${userId}:`,
        existingSenders.map((s) => ({
          trackId: s.track ? s.track.id : null,
          trackKind: s.track ? s.track.kind : null,
        }))
      );

      // Добавляем каждый трек в соединение
      stream.getTracks().forEach((track) => {
        try {
          // Проверяем, есть ли уже отправитель для этого типа трека
          const existingSender = existingSenders.find(
            (sender) => sender.track && sender.track.kind === track.kind
          );

          if (existingSender) {
            // Заменяем трек в существующем отправителе
            webrtcLogger.log(`Replacing ${track.kind} track for ${userId}:`, {
              oldTrackId: existingSender.track ? existingSender.track.id : null,
              newTrackId: track.id,
            });
            existingSender.replaceTrack(track);
          } else {
            // Добавляем новый трек
            webrtcLogger.log(`Adding new ${track.kind} track for ${userId}:`, {
              trackId: track.id,
            });
            peerConnection.addTrack(track, stream);
          }
        } catch (e) {
          webrtcLogger.error(`Error adding/replacing track for ${userId}:`, e);
        }
      });

      // Проверяем необходимость перезапуска ICE
      if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "failed"
      ) {
        webrtcLogger.log(
          `ICE connection is ${peerConnection.iceConnectionState}, restarting for ${userId}`
        );
        this.restartIce(userId);
      }

      this.maybeNegotiate(userId);
    });
  }

  async startScreenShare() {
    if (this.screenStream) return this.screenStream;
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen sharing is not supported in this browser");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: false,
    });

    if (!stream) {
      throw new Error("Failed to start screen sharing");
    }

    this.screenStream = stream;

    // Auto-stop when the user ends sharing from the browser UI.
    const firstVideoTrack = stream.getVideoTracks?.()?.[0];
    if (firstVideoTrack) {
      firstVideoTrack.onended = () => {
        try {
          this.stopScreenShare();
        } catch {
          // ignore
        }
      };
    }

    // Attach to existing peer connections.
    this.peerConnections.forEach((peerConnection, peerId) => {
      const normalizedPeerId = this.normalizePeerId(peerId);
      if (!normalizedPeerId) return;

      const prevSenders =
        this.screenShareSendersByPeerId.get(normalizedPeerId) || [];
      const nextSenders = Array.isArray(prevSenders) ? [...prevSenders] : [];

      stream.getTracks().forEach((track) => {
        try {
          const sender = peerConnection.addTrack(track, stream);
          if (sender) nextSenders.push(sender);
        } catch (e) {
          webrtcLogger.error(
            `Error adding screen share track for ${normalizedPeerId}:`,
            e
          );
        }
      });

      if (nextSenders.length > 0) {
        this.screenShareSendersByPeerId.set(normalizedPeerId, nextSenders);
      }

      try {
        this.maybeNegotiate(normalizedPeerId);
      } catch {
        // ignore
      }
    });

    if (this.currentChatId) {
      try {
        websocketService.send({
          type: "webrtc_screen_share_started",
          data: { chatId: String(this.currentChatId) },
        });
      } catch {
        // ignore
      }
    }

    return stream;
  }

  stopScreenShare() {
    const stream = this.screenStream;
    if (!stream) return;

    this.screenStream = null;

    // Detach senders from peer connections.
    this.peerConnections.forEach((peerConnection, peerId) => {
      const normalizedPeerId = this.normalizePeerId(peerId);
      if (!normalizedPeerId) return;

      const senders =
        this.screenShareSendersByPeerId.get(normalizedPeerId) || [];
      for (const sender of senders) {
        if (!sender) continue;
        try {
          peerConnection.removeTrack(sender);
        } catch {
          try {
            sender.replaceTrack(null);
          } catch {
            // ignore
          }
        }
      }

      this.screenShareSendersByPeerId.delete(normalizedPeerId);

      try {
        this.maybeNegotiate(normalizedPeerId);
      } catch {
        // ignore
      }
    });

    if (this.currentChatId) {
      try {
        websocketService.send({
          type: "webrtc_screen_share_stopped",
          data: { chatId: String(this.currentChatId) },
        });
      } catch {
        // ignore
      }
    }

    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }

  joinCall(
    chatId,
    participants,
    callType,
    chatType,
    isJoiningExistingCall = false
  ) {
    // Проверяем, не завершился ли звонок недавно (в течение 5 секунд)
    const normalizedChatId = String(chatId);
    const now = Date.now();
    const timeSinceLastCallEnd = now - this.lastCallEndTime;
    const recentlyEndedCall = timeSinceLastCallEnd < 5000; // 5 секунд
    const isSameChatAsLastCall = normalizedChatId === this.currentChatId;

    webrtcLogger.persistLog("Joining WebRTC call:", {
      chatId,
      participants,
      callType,
      chatType,
      isJoiningExistingCall,
      timeSinceLastCallEnd,
      recentlyEndedCall,
      isSameChatAsLastCall,
    });

    // Если звонок в том же чате завершился недавно, предотвращаем повторное присоединение
    if (recentlyEndedCall && isSameChatAsLastCall && !isJoiningExistingCall) {
      webrtcLogger.persistLog("Preventing rejoin to recently ended call");
      if (this.onCallError) {
        this.onCallError({
          message:
            "Звонок недавно завершен, подождите немного перед новым звонком",
          type: "rejoin_prevention",
        });
      }
      return;
    }

    // Сохраняем текущий chatId
    // Clean up any existing peer connections before joining
    this.peerConnections.forEach((peerConnection) => {
      peerConnection.close();
    });
    this.peerConnections.clear();
    this.initiatorPeers.clear();
    this.negotiationInProgress.clear();
    this.pendingIceCandidates.clear();
    this.remoteStreams.clear();
    this.screenShareSendersByPeerId.clear();

    this.pendingNegotiations.clear();
    this.pendingNegotiationTimers.forEach((handle) => {
      try {
        clearTimeout(handle);
      } catch {
        // ignore
      }
    });
    this.pendingNegotiationTimers.clear();

    this.disconnectTimers.forEach((handle) => {
      try {
        clearTimeout(handle);
      } catch {
        // ignore
      }
    });
    this.disconnectTimers.clear();

    // Save the current chat/call type for deterministic negotiation behavior
    this.currentChatId = normalizedChatId;
    this.currentCallType = callType || null;
    this.currentChatType = chatType || null;
    this.currentParticipants = Array.isArray(participants) ? participants : null;

    // If we're joining an existing call, we may never receive a "user_joined" event
    // for already-present participants. Prime peer connections so we can accept offers/ICE.
    if (isJoiningExistingCall && Array.isArray(participants)) {
      const localUserId = Number(this.normalizePeerId(websocketService.userId));
      for (const participant of participants) {
        const remoteId = this.normalizePeerId(
          participant?.id ?? participant?.userId ?? participant
        );
        if (!remoteId) continue;
        if (
          String(remoteId) ===
          String(this.normalizePeerId(websocketService.userId))
        ) {
          continue;
        }

        const remoteUserId = Number(remoteId);
        const shouldInitiateOffer =
          Number.isFinite(localUserId) && Number.isFinite(remoteUserId)
            ? localUserId < remoteUserId
            : false;

        this.createPeerConnection(remoteId, shouldInitiateOffer);
      }
    }

    // Notify server that we're joining the call
    try {
      websocketService.send({
        type: "webrtc_join_call",
        data: {
          chatId: normalizedChatId,
          participants: participants,
          callType: callType,
          chatType: chatType,
          isJoiningExistingCall: isJoiningExistingCall,
          clientTimestamp: Date.now(), // Add client timestamp for debugging
        },
      });
      webrtcLogger.persistLog("Join call request sent successfully");
    } catch (error) {
      webrtcLogger.error("Error sending join call request:", error);
      // Notify any listeners about the error
      if (this.onCallError) {
        this.onCallError(error);
      }
    }
  }

  leaveCall(chatId) {
    webrtcLogger.persistLog("Leaving WebRTC call:", chatId);
    const normalizedChatId = String(chatId);

    // Запоминаем время выхода из звонка
    this.lastCallEndTime = Date.now();
    webrtcLogger.log("Setting lastCallEndTime:", this.lastCallEndTime);

    // Close all peer connections
    this.peerConnections.forEach((peerConnection, userId) => {
      webrtcLogger.log(`Closing peer connection for ${userId}`);
      peerConnection.close();
    });
    this.peerConnections.clear();
    this.initiatorPeers.clear();
    this.negotiationInProgress.clear();
    this.pendingIceCandidates.clear();
    this.remoteStreams.clear();
    this.screenShareSendersByPeerId.clear();

    this.pendingNegotiations.clear();
    this.pendingNegotiationTimers.forEach((handle) => {
      try {
        clearTimeout(handle);
      } catch {
        // ignore
      }
    });
    this.pendingNegotiationTimers.clear();

    this.disconnectTimers.forEach((handle) => {
      try {
        clearTimeout(handle);
      } catch {
        // ignore
      }
    });
    this.disconnectTimers.clear();

    // Release media streams
    if (this.localStream) {
      webrtcLogger.log("Stopping local media tracks");
      this.localStream.getTracks().forEach((track) => {
        webrtcLogger.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      this.localStream = null;
    }

    if (this.screenStream) {
      try {
        this.stopScreenShare();
      } catch {
        // ignore
      }
    }

    this.currentChatId = null;
    this.currentCallType = null;
    this.currentChatType = null;
    this.currentParticipants = null;

    // Notify server that we're leaving
    try {
      websocketService.send({
        type: "webrtc_leave_call",
        data: {
          chatId: normalizedChatId,
          clientTimestamp: Date.now(), // Add client timestamp for debugging
        },
      });
      webrtcLogger.persistLog("Leave call request sent successfully");
    } catch (error) {
      webrtcLogger.error("Error sending leave call request:", error);
      // Even if the request fails, we've already cleaned up local resources
    }
  }

  // Метод для сброса всех колбэков
  resetCallbacks() {
    webrtcLogger.log("Resetting WebRTC callbacks");
    // Сохраняем ссылку на onCallError, так как он может понадобиться для сообщения об ошибках
    const errorCallback = this.onCallError;

    this.onRemoteStream = null;
    this.onUserDisconnected = null;
    this.onCallStartTimeUpdate = null;
    this.onCallIdUpdate = null;
    this.onParticipantJoined = null;

    // Восстанавливаем колбэк для ошибок
    this.onCallError = errorCallback;
  }

  handleWebSocketReconnect() {
    const chatId = this.currentChatId;
    if (!chatId) return;
    if (!this.currentCallType || !this.currentChatType) return;

    websocketService.send({
      type: "webrtc_join_call",
      data: {
        chatId: String(chatId),
        participants: this.currentParticipants || [],
        callType: this.currentCallType,
        chatType: this.currentChatType,
        isJoiningExistingCall: true,
        reconnect: true,
        clientTimestamp: Date.now(),
      },
    });

    for (const peerId of this.initiatorPeers) {
      try {
        this.restartIce(peerId);
      } catch {
        // ignore
      }
    }
  }

  // Callback functions to be set by the VideoCall component
  onRemoteStream = null;
  onUserDisconnected = null;
  onCallStartTimeUpdate = null;
  onCallIdUpdate = null;
  onParticipantJoined = null;
  onCallError = null; // New callback for error handling

  // Check if there's an active call for a chat with improved error handling
  checkActiveCall(chatId, options = {}) {
    const normalizedChatId = String(chatId);
    const force = !!options?.force;
    // Проверяем, не завершился ли звонок недавно (в течение 5 секунд)
    const now = Date.now();
    const timeSinceLastCallEnd = now - this.lastCallEndTime;
    const recentlyEndedCall = timeSinceLastCallEnd < 5000; // 5 секунд
    const isSameChatAsLastCall =
      normalizedChatId === String(this.currentChatId);

    // Если звонок в этом чате недавно завершился, возвращаем null
    if (!force && recentlyEndedCall && isSameChatAsLastCall) {
      webrtcLogger.persistLog(
        "Call recently ended, skipping active call check",
        {
          chatId: normalizedChatId,
          timeSinceLastCallEnd,
          lastCallEndTime: this.lastCallEndTime,
        }
      );
      return Promise.resolve(null);
    }

    // Keep track of pending requests to avoid duplicates
    if (
      this._pendingActiveCallChecks &&
      this._pendingActiveCallChecks[normalizedChatId]
    ) {
      webrtcLogger.log(
        `Already checking for active call in chat: ${normalizedChatId}, returning existing promise`
      );
      return this._pendingActiveCallChecks[normalizedChatId];
    }

    // Initialize the tracking object if it doesn't exist
    if (!this._pendingActiveCallChecks) {
      this._pendingActiveCallChecks = {};
    }

    // Maximum number of retry attempts
    const MAX_RETRIES = 3;
    // Timeout in milliseconds (30 seconds)
    const TIMEOUT_MS = 30000;
    // Exponential backoff base (in ms)
    const BACKOFF_BASE = 1000;

    // Create the promise and store it
    const promise = new Promise((resolve) => {
      let retryCount = 0;

      const attemptCheck = () => {
        webrtcLogger.persistLog(
          `Checking for active call in chat: ${normalizedChatId} (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`
        );

        // Create a unique handler ID to avoid duplicate handlers
        const handlerId = `active_call_response_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const messageHandler = (message) => {
          websocketService.offMessage("active_call_response", messageHandler);
          clearTimeout(timeoutId);

          // Clear the pending request
          if (this._pendingActiveCallChecks) {
            delete this._pendingActiveCallChecks[normalizedChatId];
          }

          webrtcLogger.log("Received active call response:", message);

          const payload = message?.data ?? message;
          const activeCallData =
            payload && typeof payload === "object" && "data" in payload
              ? payload.data
              : payload;

          if (payload?.error) {
            webrtcLogger.error("Error in active call response:", payload.error);
            // Instead of rejecting, resolve with null to prevent application crashes
            resolve(null);
          } else {
            webrtcLogger.log("Active call data:", activeCallData);
            resolve(activeCallData || null);
          }
        };

        // Register one-time handler for the response
        websocketService.onMessage("active_call_response", messageHandler);

        try {
          // Send request to check for active call
          webrtcLogger.log(
            `Sending check_active_call request for chat: ${normalizedChatId} (attempt ${
              retryCount + 1
            }/${MAX_RETRIES})`
          );
          websocketService.send({
            type: "check_active_call",
            data: {
              chatId: normalizedChatId,
              requestId: handlerId, // Add a unique request ID for tracking
            },
          });
        } catch (error) {
          websocketService.offMessage("active_call_response", messageHandler);
          webrtcLogger.error(
            `Error sending check_active_call request (attempt ${
              retryCount + 1
            }/${MAX_RETRIES}):`,
            error
          );

          // If we have retries left, try again with exponential backoff
          if (retryCount < MAX_RETRIES - 1) {
            retryCount++;
            const backoffTime = BACKOFF_BASE * Math.pow(2, retryCount - 1);
            webrtcLogger.log(`Retrying in ${backoffTime}ms...`);
            setTimeout(attemptCheck, backoffTime);
            return;
          }

          // Clear the pending request
          if (this._pendingActiveCallChecks) {
            delete this._pendingActiveCallChecks[normalizedChatId];
          }

          // Instead of rejecting, resolve with null to prevent application crashes
          resolve(null);
          return;
        }

        // Set timeout to prevent hanging if no response
        const timeoutId = setTimeout(() => {
          websocketService.offMessage("active_call_response", messageHandler);
          webrtcLogger.error(
            `Timeout checking for active call in chat: ${normalizedChatId} (attempt ${
              retryCount + 1
            }/${MAX_RETRIES})`
          );

          // If we have retries left, try again with exponential backoff
          if (retryCount < MAX_RETRIES - 1) {
            retryCount++;
            const backoffTime = BACKOFF_BASE * Math.pow(2, retryCount - 1);
            webrtcLogger.log(`Retrying in ${backoffTime}ms...`);
            setTimeout(attemptCheck, backoffTime);
            return;
          }

          // Clear the pending request
          if (this._pendingActiveCallChecks) {
            delete this._pendingActiveCallChecks[normalizedChatId];
          }

          // Instead of rejecting with an error, resolve with null to indicate no active call
          // This prevents the application from crashing when a timeout occurs
          resolve(null);
        }, TIMEOUT_MS / MAX_RETRIES); // Divide timeout by number of retries
      };

      // Start the first attempt
      attemptCheck();
    });

    // Store the promise
    this._pendingActiveCallChecks[normalizedChatId] = promise;

    return promise;
  }
  // Метод для предпочтения H.264 кодека в SDP
  preferH264(sdp) {
    // Safe SDP munging: only re-order payload types on m=video lines.
    // If this ever causes setLocalDescription() to fail, callers fall back to the original offer.
    if (typeof sdp !== "string" || !sdp.includes("m=video")) return sdp;

    const h264PayloadTypesSet = new Set();
    const rtpmapRegex = /^a=rtpmap:(\d+)\s+H264\/\d+/gim;
    let match;
    while ((match = rtpmapRegex.exec(sdp)) !== null) {
      if (match[1]) h264PayloadTypesSet.add(match[1]);
    }

    if (h264PayloadTypesSet.size === 0) return sdp;

    const videoMLineRegex = /^m=video\s+(\d+)\s+([^\s]+)\s+(.+)$/gim;
    return sdp.replace(videoMLineRegex, (line, port, proto, formats) => {
      const payloadTypes = String(formats || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (payloadTypes.length === 0) return line;

      const h264InLine = payloadTypes.filter((pt) =>
        h264PayloadTypesSet.has(pt)
      );
      if (h264InLine.length === 0) return line;

      const rest = payloadTypes.filter((pt) => !h264PayloadTypesSet.has(pt));
      return `m=video ${port} ${proto} ${[...h264InLine, ...rest].join(" ")}`;
    });

    const videoSections = sdp.split("m=video");
    if (videoSections.length <= 1) {
      return sdp; // Нет видео секции
    }

    let header = videoSections[0];
    let videoSection = "m=video" + videoSections[1];

    // Находим строки с H.264 кодеком
    const h264Lines = videoSection
      .split("\r\n")
      .filter((line) => line.includes("H264") || line.includes("h264"));

    if (h264Lines.length === 0) {
      return sdp; // H.264 не найден
    }

    // Извлекаем payload типы для H.264
    const h264PayloadTypes = h264Lines
      .map((line) => {
        const match = line.match(/a=rtpmap:(\d+) H264/i);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (h264PayloadTypes.length === 0) {
      return sdp; // Не удалось извлечь payload типы
    }

    // Модифицируем строку m=video, чтобы H.264 был первым
    const mLineRegex = /m=video\s+\d+\s+\w+\s+(.*)/;
    const mLineMatch = videoSection.match(mLineRegex);

    if (!mLineMatch) {
      return sdp; // Не удалось найти строку m=video
    }

    const payloadTypes = mLineMatch[1].split(" ");

    // Удаляем H.264 payload типы из списка
    const filteredPayloadTypes = payloadTypes.filter(
      (pt) => !h264PayloadTypes.includes(pt)
    );

    // Добавляем H.264 payload типы в начало списка
    const newPayloadTypes = [...h264PayloadTypes, ...filteredPayloadTypes];

    // Заменяем строку m=video
    const newMLine = videoSection.replace(
      mLineRegex,
      `m=video $1 ${newPayloadTypes.join(" ")}`
    );

    // Собираем SDP обратно
    return header + newMLine;
  }

  // Метод для проверки поддержки WebRTC в браузере
  checkBrowserSupport() {
    const result = {
      supported: true,
      details: {
        browser: adapter.browserDetails.browser,
        version: adapter.browserDetails.version,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        RTCPeerConnection: !!window.RTCPeerConnection,
        RTCSessionDescription: !!window.RTCSessionDescription,
        RTCIceCandidate: !!window.RTCIceCandidate,
      },
    };

    // Проверяем основные компоненты WebRTC
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      result.supported = false;
      result.error = "getUserMedia не поддерживается";
    } else if (!window.RTCPeerConnection) {
      result.supported = false;
      result.error = "RTCPeerConnection не поддерживается";
    }

    webrtcLogger.persistLog("Browser WebRTC support check:", result);
    return result;
  }
}

// Создаем и экспортируем экземпляр сервиса
export const webrtcService = new WebRTCService();

// Проверяем поддержку WebRTC при инициализации
webrtcService.checkBrowserSupport();

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import styles from "./styles.module.css";
import VideoCallDebug from "./VideoCallDebug";
import Avatar from "@/components/Avatar/Avatar";

import { webrtcService } from "@/services/webrtc";
import { websocketService } from "@/services/websocket";
import {
  addRemoteParticipant,
  endCall,
  removeRemoteParticipant,
  setCallError,
  setCallId,
  setCallStatus,
  setGlobalCallStartTime,
  toggleAudio,
  toggleVideo,
} from "@/app/store/call/callSlice";

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function MicIcon({ muted = false }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CameraIcon({ off = false }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <path d="M14 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      {off && <path d="M2 2l20 20" />}
    </svg>
  );
}

function ScreenShareIcon({ active = false }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
      <path d="M7 20h10" />
      <path d="M12 16v4" />
      {active && <path d="M9 9l3-3 3 3" />}
      {active && <path d="M12 6v6" />}
    </svg>
  );
}

function ChevronIcon({ direction = "down" }) {
  const d = direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function VideoStream({
  stream,
  muted = false,
  className,
  ...props
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!stream) {
      if (el.srcObject) el.srcObject = null;
      return;
    }

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const playPromise = el.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      {...props}
    />
  );
}

function AudioStream({ stream, className, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!stream) {
      if (el.srcObject) el.srcObject = null;
      return;
    }

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const playPromise = el.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [stream]);

  return <audio ref={ref} autoPlay className={className} {...props} />;
}

function TileMedia({
  stream,
  label,
  avatarSrc,
  avatarSize,
  videoClassName,
  avatarClassName,
  callType,
  isLocal,
  kind,
  isLocalVideoEnabled,
}) {
  const videoTrack = stream?.getVideoTracks?.()?.[0] || null;
  const [hasPlayback, setHasPlayback] = useState(false);

  useEffect(() => {
    if (callType !== "video" || !videoTrack) {
      setHasPlayback(false);
      return;
    }

    if (isLocal) {
      setHasPlayback(true);
      return;
    }

    setHasPlayback(videoTrack.readyState === "live" && videoTrack.muted === false);

    const handleUnmute = () => setHasPlayback(true);
    const handleMute = () => setHasPlayback(false);
    const handleEnded = () => setHasPlayback(false);

    try {
      videoTrack.addEventListener?.("unmute", handleUnmute);
      videoTrack.addEventListener?.("mute", handleMute);
      videoTrack.addEventListener?.("ended", handleEnded);
    } catch {
      // ignore
    }

    return () => {
      try {
        videoTrack.removeEventListener?.("unmute", handleUnmute);
        videoTrack.removeEventListener?.("mute", handleMute);
        videoTrack.removeEventListener?.("ended", handleEnded);
      } catch {
        // ignore
      }
    };
  }, [callType, isLocal, videoTrack?.id]);

  const hasVideoTrack = callType === "video" && !!videoTrack;
  const showVideo = hasVideoTrack
    ? kind === "camera" && isLocal
      ? !!isLocalVideoEnabled && videoTrack.enabled !== false
      : hasPlayback
    : false;

  return (
    <>
      {hasVideoTrack && (
        <VideoStream
          stream={stream}
          muted
          className={videoClassName}
          onLoadedData={() => setHasPlayback(true)}
          onPlaying={() => setHasPlayback(true)}
        />
      )}

      {(!hasVideoTrack || !showVideo) && (
        <div className={avatarClassName}>
          <Avatar src={avatarSrc} name={label} size={avatarSize} />
        </div>
      )}
    </>
  );
}

export default function VideoCall() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const callState = useSelector((state) => state.call);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tick, setTick] = useState(0);
  const [dockEl, setDockEl] = useState(null);
  const [audioLevels, setAudioLevels] = useState({});
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [localCameraStream, setLocalCameraStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteCameraStreams, setRemoteCameraStreams] = useState({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({});
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [thumbPage, setThumbPage] = useState(0);

  const localStreamRef = useRef(null);
  const activeCallInfoRef = useRef({ isCallActive: false, chatId: null });

  const remoteStreamsRef = useRef({});
  const remoteParticipantIdsRef = useRef([]);

  const audioContextRef = useRef(null);
  const analysersByParticipantIdRef = useRef(new Map()); // id -> { analyser, data, source, trackId }

  const activeCallKey = useMemo(() => {
    if (!callState.isCallActive) return null;
    return callState.callSessionId || null;
  }, [callState.isCallActive, callState.callSessionId]);

  const startedCallKeyRef = useRef(null);

  useEffect(() => {
    remoteParticipantIdsRef.current = (callState.remoteParticipants || []).map(
      (id) => String(id)
    );
  }, [callState.remoteParticipants]);

  useEffect(() => {
    const updateDock = () => {
      setDockEl(document.getElementById("zcord-call-dock"));
    };

    updateDock();

    const observer = new MutationObserver(updateDock);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!callState.isCallActive) {
      setAudioLevels({});
      setActiveSpeakerId(null);

      for (const entry of analysersByParticipantIdRef.current.values()) {
        try {
          entry.source?.disconnect();
        } catch {
          // ignore
        }
        try {
          entry.analyser?.disconnect();
        } catch {
          // ignore
        }
      }
      analysersByParticipantIdRef.current.clear();

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close?.();
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }
      return;
    }

    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return;

    const ctx = new AudioContextImpl();
    audioContextRef.current = ctx;
    if (ctx.state === "suspended") {
      ctx.resume?.().catch(() => {});
    }

    const cleanupAnalyser = (participantId) => {
      const id = String(participantId);
      const entry = analysersByParticipantIdRef.current.get(id);
      if (!entry) return;

      try {
        entry.source?.disconnect();
      } catch {
        // ignore
      }
      try {
        entry.analyser?.disconnect();
      } catch {
        // ignore
      }

      analysersByParticipantIdRef.current.delete(id);
    };

    const ensureAnalyser = (participantId, stream) => {
      const id = String(participantId);
      const track = stream?.getAudioTracks?.()?.[0];
      if (!track) return false;

      const existing = analysersByParticipantIdRef.current.get(id);
      if (existing && existing.trackId === track.id) return true;

      if (existing) cleanupAnalyser(id);

      try {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const data = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        analysersByParticipantIdRef.current.set(id, {
          source,
          analyser,
          data,
          trackId: track.id,
        });
        return true;
      } catch {
        return false;
      }
    };

    const intervalId = setInterval(() => {
      const desired = new Set();
      const localId = String(user.id);

      if (ensureAnalyser(localId, localStreamRef.current)) desired.add(localId);

      for (const participantId of remoteParticipantIdsRef.current) {
        const stream = remoteStreamsRef.current[participantId];
        if (ensureAnalyser(participantId, stream)) {
          desired.add(String(participantId));
        }
      }

      for (const existingId of Array.from(
        analysersByParticipantIdRef.current.keys()
      )) {
        if (!desired.has(existingId)) cleanupAnalyser(existingId);
      }

      const nextLevels = {};
      let loudestId = null;
      let loudest = 0;

      for (const [id, entry] of analysersByParticipantIdRef.current.entries()) {
        try {
          entry.analyser.getByteTimeDomainData(entry.data);
        } catch {
          continue;
        }

        let sum = 0;
        for (let i = 0; i < entry.data.length; i++) {
          const v = (entry.data[i] - 128) / 128;
          sum += v * v;
        }

        const rms = Math.sqrt(sum / entry.data.length);
        nextLevels[id] = rms;
        if (rms > loudest) {
          loudest = rms;
          loudestId = id;
        }
      }

      setAudioLevels(nextLevels);

      const threshold = 0.03;
      setActiveSpeakerId(loudestId && loudest >= threshold ? loudestId : null);
    }, 150);

    return () => {
      clearInterval(intervalId);

      for (const entry of analysersByParticipantIdRef.current.values()) {
        try {
          entry.source?.disconnect();
        } catch {
          // ignore
        }
        try {
          entry.analyser?.disconnect();
        } catch {
          // ignore
        }
      }
      analysersByParticipantIdRef.current.clear();

      try {
        ctx.close?.();
      } catch {
        // ignore
      }
      if (audioContextRef.current === ctx) {
        audioContextRef.current = null;
      }
    };
  }, [callState.isCallActive, user.id]);

  useEffect(() => {
    if (!callState.isCallActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [callState.isCallActive]);

  const callDuration = useMemo(() => {
    if (!callState.isCallActive || !callState.callStartTime) return "0:00";
    return formatDuration(Date.now() - callState.callStartTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState.isCallActive, callState.callStartTime, tick]);

  useEffect(() => {
    if (!callState.isCallActive) setIsCollapsed(false);
  }, [callState.isCallActive]);

  useEffect(() => {
    activeCallInfoRef.current = {
      isCallActive: !!callState.isCallActive,
      chatId: callState.chatId,
    };
  }, [callState.isCallActive, callState.chatId]);

  useEffect(() => {
    if (!callState.isCallActive || !callState.chatId) return;

    websocketService.subscribeToChat(callState.chatId, "call");
    return () => websocketService.unsubscribeFromChat(callState.chatId, "call");
  }, [callState.isCallActive, callState.chatId]);

  useEffect(() => {
    const handler = () => {
      const { isCallActive, chatId } = activeCallInfoRef.current || {};
      if (isCallActive && chatId) {
        try {
          webrtcService.leaveCall(chatId);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, []);

  useEffect(() => {
    webrtcService.onRemoteStream = (participantId, stream) => {
      const id = String(participantId);
      const hasVideo = (stream?.getVideoTracks?.()?.length || 0) > 0;
      const hasAudio = (stream?.getAudioTracks?.()?.length || 0) > 0;

      if (hasVideo && !hasAudio) {
        setRemoteScreenStreams((prev) => ({ ...prev, [id]: stream }));

        const track = stream?.getVideoTracks?.()?.[0];
        if (track?.addEventListener) {
          track.addEventListener(
            "ended",
            () => {
              setRemoteScreenStreams((prev) => {
                if (!prev[id]) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
              });
            },
            { once: true }
          );
        }
      } else {
        remoteStreamsRef.current[id] = stream;
        setRemoteCameraStreams((prev) => ({ ...prev, [id]: stream }));
        // If a camera stream was temporarily classified as screen share (e.g. before audio track arrives),
        // drop that duplicate screen entry once we see audio.
        setRemoteScreenStreams((prev) => {
          const existing = prev[id];
          if (!existing) return prev;
          if (existing === stream || existing?.id === stream?.id) {
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return prev;
        });
      }

      dispatch(addRemoteParticipant(id));
      dispatch(setCallStatus("connected"));
    };

    webrtcService.onUserDisconnected = (participantId) => {
      const id = String(participantId);
      delete remoteStreamsRef.current[id];

      setRemoteCameraStreams((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });

      setRemoteScreenStreams((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });

      dispatch(removeRemoteParticipant(id));
    };

    webrtcService.onCallStartTimeUpdate = (globalStartTime) => {
      dispatch(setGlobalCallStartTime(globalStartTime));
    };

    webrtcService.onCallIdUpdate = (callId) => {
      dispatch(setCallId(callId));
    };

    webrtcService.onParticipantJoined = (participantId) => {
      dispatch(addRemoteParticipant(participantId));
    };

    webrtcService.onCallError = (error) => {
      dispatch(
        setCallError({
          message: error?.message || "WebRTC error",
          type: error?.type || "webrtc",
          fatal: !!error?.fatal,
        })
      );
    };

    return () => {
      webrtcService.resetCallbacks?.();
    };
  }, [dispatch]);

  useEffect(() => {
    if (!callState.isCallActive) return;
    if (!localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !!callState.isVideoEnabled;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = !!callState.isAudioEnabled;
  }, [
    callState.isCallActive,
    callState.isVideoEnabled,
    callState.isAudioEnabled,
  ]);

  useEffect(() => {
    const cleanupLocal = () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      try {
        webrtcService.stopScreenShare?.();
      } catch {
        // ignore
      }

      if (localScreenStream) {
        localScreenStream.getTracks().forEach((t) => t.stop());
      }
      setLocalScreenStream(null);
      setLocalCameraStream(null);
      setRemoteCameraStreams({});
      setRemoteScreenStreams({});
      setSelectedTileId(null);
      setThumbPage(0);
      remoteStreamsRef.current = {};
    };

    const start = async () => {
      if (!activeCallKey) return;
      if (startedCallKeyRef.current === activeCallKey) return;
      startedCallKeyRef.current = activeCallKey;

      dispatch(setCallStatus("calling"));

      try {
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video:
            callState.callType === "video"
              ? { width: { ideal: 1280 }, height: { ideal: 720 } }
              : false,
        };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          if (callState.callType === "video") {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: constraints.audio,
              video: false,
            });
            dispatch(
              setCallError({
                message:
                  "Камера занята в другом окне/вкладке. Подключаемся без видео.",
                type: "media",
                fatal: false,
              })
            );
            if (callState.isVideoEnabled) dispatch(toggleVideo());
          } else {
            throw err;
          }
        }

        localStreamRef.current = stream;
        setLocalCameraStream(stream);
        webrtcService.setLocalStream(stream);

        const hasVideoTrack = stream.getVideoTracks().length > 0;
        const hasAudioTrack = stream.getAudioTracks().length > 0;

        if (callState.callType === "video" && !hasVideoTrack) {
          dispatch(
            setCallError({
              message: "Не удалось получить видеотрек, работаем без видео.",
              type: "media",
              fatal: false,
            })
          );
          if (callState.isVideoEnabled) dispatch(toggleVideo());
        }

        if (!hasAudioTrack) {
          dispatch(
            setCallError({
              message:
                "Не удалось получить микрофон. Проверьте разрешения браузера.",
              type: "media",
              fatal: true,
            })
          );
          dispatch(setCallStatus("error"));
          try {
            if (callState.chatId) webrtcService.leaveCall(callState.chatId);
          } catch {
            // ignore
          }
          dispatch(endCall());
          cleanupLocal();
          return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = !!callState.isVideoEnabled;

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = !!callState.isAudioEnabled;

        webrtcService.joinCall(
          callState.chatId,
          callState.participants,
          callState.callType,
          callState.chatType,
          callState.isJoiningExistingCall
        );
      } catch (e) {
        dispatch(
          setCallError({
            message: e?.message || "Failed to access camera/microphone",
            type: "media",
            fatal: true,
          })
        );
        dispatch(setCallStatus("error"));
        try {
          if (callState.chatId) webrtcService.leaveCall(callState.chatId);
        } catch {
          // ignore
        }
        dispatch(endCall());
        cleanupLocal();
      }
    };

    if (!activeCallKey) {
      startedCallKeyRef.current = null;
      cleanupLocal();
      return;
    }

    start();

    return () => {
      if (startedCallKeyRef.current === activeCallKey) {
        cleanupLocal();
      }
    };
  }, [
    activeCallKey,
    callState.chatId,
    callState.chatType,
    callState.callType,
    callState.isJoiningExistingCall,
    dispatch,
  ]);

  const handleToggleVideo = () => dispatch(toggleVideo());
  const handleToggleAudio = () => dispatch(toggleAudio());
  const handleToggleScreenShare = async () => {
    if (!callState.isCallActive) return;
    if (callState.callType !== "video") return;

    if (localScreenStream) {
      try {
        webrtcService.stopScreenShare();
      } catch {
        // ignore
      }
      setLocalScreenStream(null);
      setSelectedTileId((prev) => (prev === "screen:local" ? null : prev));
      return;
    }

    try {
      const stream = await webrtcService.startScreenShare();
      setLocalScreenStream(stream);

      const track = stream?.getVideoTracks?.()?.[0];
      if (track?.addEventListener) {
        track.addEventListener(
          "ended",
          () => {
            setLocalScreenStream(null);
            setSelectedTileId((prev) => (prev === "screen:local" ? null : prev));
          },
          { once: true }
        );
      }
    } catch (e) {
      dispatch(
        setCallError({
          message: e?.message || "Не удалось начать демонстрацию экрана",
          type: "media",
          fatal: false,
        })
      );
    }
  };

  const localParticipantId = String(user.id);

  const getMeterValue = (participantId) => {
    const raw = audioLevels[String(participantId)] || 0;
    return Math.max(0, Math.min(1, raw * 3));
  };

  const participantsById = useMemo(() => {
    const map = new Map();
    for (const participant of callState.participants || []) {
      const key = String(participant?.id ?? participant?.userId ?? participant);
      if (!key || key === "undefined" || key === "null") continue;
      map.set(key, participant);
    }
    return map;
  }, [callState.participants]);

  const tiles = useMemo(() => {
    if (!callState.isCallActive) return [];

    const result = [];

    result.push({
      id: "cam:local",
      kind: "camera",
      participantId: localParticipantId,
      stream: localCameraStream,
      label: "Вы",
      avatarSrc: user.imageSrc,
      isLocal: true,
    });

    if (localScreenStream) {
      result.push({
        id: "screen:local",
        kind: "screen",
        participantId: localParticipantId,
        stream: localScreenStream,
        label: "Трансляция - Вы",
        avatarSrc: user.imageSrc,
        isLocal: true,
      });
    }

    for (const participantIdRaw of callState.remoteParticipants || []) {
      const participantId = String(participantIdRaw);
      const meta = participantsById.get(participantId);
      const name = meta?.name || participantId;
      const avatarSrc = meta?.imageSrc ?? meta?.avatar ?? null;

      result.push({
        id: `cam:${participantId}`,
        kind: "camera",
        participantId,
        stream: remoteCameraStreams[participantId] || null,
        label: name,
        avatarSrc,
        isLocal: false,
      });

      const screenStream = remoteScreenStreams[participantId] || null;
      if (screenStream) {
        result.push({
          id: `screen:${participantId}`,
          kind: "screen",
          participantId,
          stream: screenStream,
          label: `Трансляция - ${name}`,
          avatarSrc,
          isLocal: false,
        });
      }
    }

    return result;
  }, [
    callState.isCallActive,
    callState.remoteParticipants,
    localCameraStream,
    localParticipantId,
    localScreenStream,
    participantsById,
    remoteCameraStreams,
    remoteScreenStreams,
    user.imageSrc,
  ]);

  const selectedTile = useMemo(() => {
    if (!selectedTileId) return null;
    return tiles.find((t) => t.id === selectedTileId) || null;
  }, [selectedTileId, tiles]);

  useEffect(() => {
    if (!selectedTileId) return;
    if (selectedTile) return;
    setSelectedTileId(null);
  }, [selectedTileId, selectedTile]);

  const thumbsPerPage = 4;
  const totalPages = Math.max(1, Math.ceil(tiles.length / thumbsPerPage));
  const currentPage = Math.min(thumbPage, totalPages - 1);
  const visibleTiles = tiles.slice(
    currentPage * thumbsPerPage,
    currentPage * thumbsPerPage + thumbsPerPage
  );

  useEffect(() => {
    setThumbPage((page) => Math.min(page, totalPages - 1));
  }, [totalPages]);

  const handleSelectTile = (tileId) => {
    const index = tiles.findIndex((t) => t.id === tileId);
    if (index >= 0) {
      setThumbPage(Math.floor(index / thumbsPerPage));
    }

    setSelectedTileId((prev) => (prev === tileId ? null : tileId));
  };

  const panel = callState.isCallActive ? (
    <section
      className={cx(styles.callPanel, isCollapsed && styles.collapsed)}
      aria-label="Call panel"
    >
      <div className={styles.callHeader}>
        <div className={styles.callInfo}>
          <h3 className={styles.callTitle}>
            {callState.chatTag ? `Звонок: ${callState.chatTag}` : "Звонок"}
          </h3>
          <div className={styles.callMeta}>
            <span className={styles.callDuration}>{callDuration}</span>
            {callState.callStatus &&
              callState.callStatus !== "connected" &&
              callState.callStatus !== "calling" && (
                <span className={styles.callStatus}>{callState.callStatus}</span>
              )}
          </div>
        </div>

        <div className={styles.headerControls}>
          <button
            type="button"
            onClick={handleToggleAudio}
            className={cx(
              styles.iconButton,
              !callState.isAudioEnabled && styles.iconButtonOff
            )}
            aria-pressed={!callState.isAudioEnabled}
            aria-label={
              callState.isAudioEnabled ? "Mute microphone" : "Unmute microphone"
            }
            title={
              callState.isAudioEnabled ? "Выключить микрофон" : "Включить микрофон"
            }
          >
            <MicIcon muted={!callState.isAudioEnabled} />
          </button>

          <button
            type="button"
            onClick={handleToggleVideo}
            disabled={callState.callType !== "video"}
            className={cx(
              styles.iconButton,
              (callState.callType !== "video" || !callState.isVideoEnabled) &&
                styles.iconButtonOff
            )}
            aria-pressed={
              callState.callType === "video" ? !callState.isVideoEnabled : undefined
            }
            aria-label={callState.isVideoEnabled ? "Disable camera" : "Enable camera"}
            title={callState.isVideoEnabled ? "Выключить камеру" : "Включить камеру"}
          >
            <CameraIcon
              off={callState.callType !== "video" || !callState.isVideoEnabled}
            />
          </button>

          <button
            type="button"
            onClick={handleToggleScreenShare}
            disabled={callState.callType !== "video"}
            className={cx(
              styles.iconButton,
              callState.callType !== "video" && styles.iconButtonOff,
              localScreenStream && styles.iconButtonActive
            )}
            aria-pressed={localScreenStream ? "true" : "false"}
            aria-label={
              localScreenStream
                ? "Stop screen sharing"
                : "Start screen sharing"
            }
            title={
              localScreenStream
                ? "Остановить демонстрацию экрана"
                : "Демонстрация экрана"
            }
          >
            <ScreenShareIcon active={!!localScreenStream} />
          </button>

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? "Expand call panel" : "Collapse call panel"}
            title={isCollapsed ? "Развернуть" : "Свернуть"}
          >
            <ChevronIcon direction={isCollapsed ? "down" : "up"} />
          </button>
        </div>
      </div>

      <div className={styles.callBody}>
        <div className={styles.thumbStrip}>
          <button
            type="button"
            className={styles.navButton}
            disabled={currentPage <= 0}
            onClick={() => setThumbPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
            title="Предыдущие участники"
          >
            ‹
          </button>

          <div className={styles.thumbList}>
            {visibleTiles.map((tile) => {
              const isSelected = selectedTileId === tile.id;
              const isActiveSpeaker =
                tile.kind === "camera" &&
                activeSpeakerId === String(tile.participantId);
              const meter = getMeterValue(tile.participantId);

              return (
                <button
                  key={tile.id}
                  type="button"
                  className={cx(
                    styles.participantCard,
                    styles.participantButton,
                    isSelected && styles.selectedCard,
                    isActiveSpeaker && styles.activeSpeaker
                  )}
                  onClick={() => handleSelectTile(tile.id)}
                  aria-pressed={isSelected}
                  title={tile.label}
                >
                  <TileMedia
                    stream={tile.stream}
                    label={tile.label}
                    avatarSrc={tile.avatarSrc}
                    avatarSize={72}
                    videoClassName={styles.video}
                    avatarClassName={styles.avatarOverlay}
                    callType={callState.callType}
                    isLocal={tile.isLocal}
                    kind={tile.kind}
                    isLocalVideoEnabled={callState.isVideoEnabled}
                  />
                  <div className={styles.cardOverlay}>
                    <div className={styles.videoLabel}>{tile.label}</div>
                    <div className={styles.audioMeter} aria-hidden="true">
                      <div
                        className={styles.audioMeterBar}
                        style={{ width: `${meter * 100}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={styles.navButton}
            disabled={currentPage >= totalPages - 1}
            onClick={() => setThumbPage((p) => Math.min(totalPages - 1, p + 1))}
            aria-label="Next page"
            title="Следующие участники"
          >
            ›
          </button>
        </div>

        {selectedTile && (
          <div className={styles.stage}>
            <div className={styles.stageContent}>
              <TileMedia
                stream={selectedTile.stream}
                label={selectedTile.label}
                avatarSrc={selectedTile.avatarSrc}
                avatarSize={160}
                videoClassName={styles.stageVideo}
                avatarClassName={styles.stageAvatarOverlay}
                callType={callState.callType}
                isLocal={selectedTile.isLocal}
                kind={selectedTile.kind}
                isLocalVideoEnabled={callState.isVideoEnabled}
              />
              <div className={styles.stageOverlay}>
                <div className={styles.stageTitle}>{selectedTile.label}</div>
                <button
                  type="button"
                  className={styles.stageClose}
                  onClick={() => setSelectedTileId(null)}
                  aria-label="Clear selection"
                  title="Снять выбор"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div aria-hidden="true">
        {Object.entries(remoteCameraStreams).map(([participantId, stream]) => (
          <AudioStream
            key={`audio:${participantId}`}
            stream={stream}
            className={styles.audioSink}
          />
        ))}
      </div>

      {callState.error?.message && (
        <div className={styles.inlineError}>{callState.error.message}</div>
      )}
    </section>
  ) : null;

  return (
    <>
      {panel && dockEl ? createPortal(panel, dockEl) : panel}
      <VideoCallDebug />
    </>
  );
}

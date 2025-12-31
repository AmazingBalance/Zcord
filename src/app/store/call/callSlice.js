import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isCallActive: false,
  callType: null, // 'video' | 'audio'
  chatType: null, // 'chat' | 'channel' | 'ls'
  chatId: null,
  chatTag: null,
  callSessionId: null, // client-side stable session id for the current call UI
  participants: [],
  isVideoEnabled: true,
  isAudioEnabled: true,
  callStatus: "idle", // 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'error'
  error: null,
  remoteParticipants: [], // Just store participant IDs, not streams
  callStartTime: null, // Local time when call started
  globalCallStartTime: null, // Server time when call started (for synchronization)
  shouldSendCallMessage: false,
  callId: null, // Database ID of the call
  isJoiningExistingCall: false, // Flag to indicate if joining an existing call
  retryCount: 0, // Counter for connection retries
  lastErrorTime: null, // Timestamp of the last error
  peerStatus: "disconnected", // 'disconnected' | 'connecting' | 'connected' | 'failed'
  peerConnections: {}, // Map of userId -> connection status
};

const callSlice = createSlice({
  name: "call",
  initialState,
  reducers: {
    startCall: (state, action) => {
      const {
        callType,
        chatType,
        chatId,
        chatTag,
        participants,
        globalStartTime,
        callId,
        isJoiningExistingCall,
      } = action.payload;
      state.isCallActive = true;
      state.callType = callType;
      state.chatType = chatType;
      state.chatId = chatId;
      state.chatTag = chatTag;
      state.callSessionId = `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      state.participants = participants;
      state.callStatus = "calling";
      state.peerStatus = "connecting";
      state.peerConnections = {};

      // Используем глобальное время начала звонка, если оно предоставлено
      state.callStartTime = Date.now(); // Локальное время начала звонка
      state.globalCallStartTime = globalStartTime || Date.now(); // Серверное время начала звонка
      state.shouldSendCallMessage = !isJoiningExistingCall; // Отправляем сообщение только если создаем новый звонок
      state.error = null;
      state.callId = callId;
      state.isJoiningExistingCall = isJoiningExistingCall || false;
    },

    endCall: (state) => {
      state.isCallActive = false;
      state.callType = null;
      state.chatType = null;
      state.chatId = null;
      state.chatTag = null;
      state.callSessionId = null;
      state.participants = [];
      state.remoteParticipants = [];
      state.callStatus = "ended";
      state.shouldSendCallMessage = true;
      state.error = null;
      state.peerStatus = "disconnected";
      state.peerConnections = {};
      // Don't reset callStartTime here - we need it for the end message
    },

    resetCallState: (state) => {
      state.callStatus = "idle";
      state.callStartTime = null;
      state.globalCallStartTime = null;
      state.shouldSendCallMessage = false;
      state.callSessionId = null;
      state.peerStatus = "disconnected";
      state.peerConnections = {};
    },

    setGlobalCallStartTime: (state, action) => {
      state.globalCallStartTime = action.payload;

      // Вычисляем разницу между локальным и глобальным временем
      // для корректной синхронизации таймера
      const now = Date.now();
      const timeDiff = now - action.payload;

      // Устанавливаем локальное время начала звонка с учетом разницы
      // Это позволит корректно отображать таймер
      state.callStartTime = now - timeDiff;
    },

    markCallMessageSent: (state) => {
      state.shouldSendCallMessage = false;
    },

    setCallStatus: (state, action) => {
      state.callStatus = action.payload;

      // If call is connected, update peer status too
      if (action.payload === "connected") {
        state.peerStatus = "connected";
      }
    },

    addRemoteParticipant: (state, action) => {
      const userId = action.payload;
      if (!state.remoteParticipants.includes(userId)) {
        state.remoteParticipants.push(userId);
      }

      // Initialize peer connection status
      if (!state.peerConnections[userId]) {
        state.peerConnections[userId] = "connecting";
      }
    },

    removeRemoteParticipant: (state, action) => {
      const userId = action.payload;
      state.remoteParticipants = state.remoteParticipants.filter(
        (id) => id !== userId
      );

      // Remove peer connection status
      delete state.peerConnections[userId];
    },

    toggleVideo: (state) => {
      state.isVideoEnabled = !state.isVideoEnabled;
    },

    toggleAudio: (state) => {
      state.isAudioEnabled = !state.isAudioEnabled;
    },

    setCallError: (state, action) => {
      state.error = action.payload;
      state.lastErrorTime = Date.now();

      // If the error is fatal, update the call status
      if (action.payload && action.payload.fatal) {
        state.callStatus = "error";
        state.peerStatus = "failed";
      }

      // Increment retry count if this is a connection error
      if (action.payload && action.payload.type === "connection") {
        state.retryCount += 1;
      }
    },

    clearCallError: (state) => {
      state.error = null;
    },

    resetRetryCount: (state) => {
      state.retryCount = 0;
    },

    addParticipant: (state, action) => {
      const participant = action.payload;
      if (!state.participants.find((p) => p.id === participant.id)) {
        state.participants.push(participant);
      }
    },

    setCallId: (state, action) => {
      state.callId = action.payload;
    },

    setIsJoiningExistingCall: (state, action) => {
      state.isJoiningExistingCall = action.payload;
    },

    removeParticipant: (state, action) => {
      const userId = action.payload;
      state.participants = state.participants.filter((p) => p.id !== userId);
    },

    // New PeerJS-specific actions
    setPeerStatus: (state, action) => {
      state.peerStatus = action.payload;
    },

    updatePeerConnection: (state, action) => {
      const { userId, status } = action.payload;
      state.peerConnections[userId] = status;

      // If all connections are established, update peer status
      if (status === "connected") {
        const allConnected = Object.values(state.peerConnections).every(
          (status) => status === "connected"
        );

        if (allConnected && state.remoteParticipants.length > 0) {
          state.peerStatus = "connected";
          state.callStatus = "connected";
        }
      }
    },

    handlePeerError: (state, action) => {
      const { userId, error } = action.payload;

      // Update the specific peer connection status
      if (userId) {
        state.peerConnections[userId] = "failed";
      }

      // Set the error message
      state.error = error;
      state.lastErrorTime = Date.now();

      // Check if all connections failed
      const allFailed = Object.values(state.peerConnections).every(
        (status) => status === "failed"
      );

      if (allFailed && state.remoteParticipants.length > 0) {
        state.peerStatus = "failed";
        state.callStatus = "error";
      }
    },
  },
});

export const {
  startCall,
  endCall,
  resetCallState,
  markCallMessageSent,
  setCallStatus,
  setGlobalCallStartTime,
  addRemoteParticipant,
  removeRemoteParticipant,
  toggleVideo,
  toggleAudio,
  setCallError,
  clearCallError,
  resetRetryCount,
  addParticipant,
  removeParticipant,
  setCallId,
  setIsJoiningExistingCall,
  // New PeerJS-specific actions
  setPeerStatus,
  updatePeerConnection,
  handlePeerError,
} = callSlice.actions;

export default callSlice.reducer;

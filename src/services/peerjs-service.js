import Peer from "peerjs";
import { websocketService } from "./websocket";
import { webrtcLogger } from "../utils/logger";

/**
 * PeerJSService - A WebRTC service implementation using PeerJS
 * This service handles video/audio calls between users
 */
class PeerJSService {
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.connections = new Map(); // Map of userId -> PeerJS connection
    this.currentChatId = null;
    this.lastCallEndTime = 0;
    this.callType = null;
    this.chatType = null;
    this.isJoiningExistingCall = false;

    // Callbacks to be set by the VideoCall component
    this.onRemoteStream = null;
    this.onUserDisconnected = null;
    this.onCallStartTimeUpdate = null;
    this.onCallIdUpdate = null;
    this.onParticipantJoined = null;
    this.onCallError = null;

    // Setup WebSocket handlers for signaling
    this.setupWebSocketHandlers();
  }

  /**
   * Setup WebSocket handlers for signaling
   */
  setupWebSocketHandlers() {
    // Listen for call-related messages
    websocketService.onMessage(
      "webrtc_user_joined",
      this.handleUserJoined.bind(this)
    );
    websocketService.onMessage(
      "webrtc_user_left",
      this.handleUserLeft.bind(this)
    );
    websocketService.onMessage(
      "active_call_response",
      this.handleActiveCallResponse.bind(this)
    );
  }

  /**
   * Initialize PeerJS
   * @param {string} userId - The current user's ID
   * @returns {Promise} - Resolves when PeerJS is initialized
   */
  initializePeer(userId) {
    return new Promise((resolve, reject) => {
      try {
        // Create a new Peer instance
        // We're not using a PeerJS server here, as we'll handle signaling through our WebSocket
        this.peer = new Peer(userId, {
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
              { urls: "stun:stun3.l.google.com:19302" },
              { urls: "stun:stun4.l.google.com:19302" },
              // TURN servers for NAT traversal
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
          },
          debug: process.env.NODE_ENV !== "production" ? 2 : 0,
        });

        // Handle PeerJS events
        this.peer.on("open", (id) => {
          webrtcLogger.persistLog(`PeerJS connected with ID: ${id}`);
          resolve(id);
        });

        this.peer.on("error", (error) => {
          webrtcLogger.error(`PeerJS error: ${error.type}`, error);

          if (this.onCallError) {
            this.onCallError({
              message: `PeerJS error: ${error.type}`,
              type: "peer_error",
              fatal: error.type === "network" || error.type === "server-error",
            });
          }

          reject(error);
        });

        this.peer.on("connection", (dataConnection) => {
          webrtcLogger.persistLog(
            `Received data connection from: ${dataConnection.peer}`
          );
          this.setupDataConnection(dataConnection);
        });

        this.peer.on("call", (mediaConnection) => {
          webrtcLogger.persistLog(
            `Received call from: ${mediaConnection.peer}`
          );
          this.handleIncomingCall(mediaConnection);
        });
      } catch (error) {
        webrtcLogger.error("Error initializing PeerJS:", error);
        reject(error);
      }
    });
  }

  /**
   * Setup a data connection with another peer
   * @param {DataConnection} dataConnection - The PeerJS data connection
   */
  setupDataConnection(dataConnection) {
    const peerId = dataConnection.peer;

    dataConnection.on("open", () => {
      webrtcLogger.persistLog(`Data connection opened with: ${peerId}`);
      this.connections.set(peerId, {
        data: dataConnection,
        media: null,
      });
    });

    dataConnection.on("data", (data) => {
      webrtcLogger.log(`Received data from ${peerId}:`, data);

      // Handle different types of data messages
      if (data.type === "callInfo") {
        // Update call information
        if (data.globalStartTime && this.onCallStartTimeUpdate) {
          this.onCallStartTimeUpdate(data.globalStartTime);
        }

        if (data.callId && this.onCallIdUpdate) {
          this.onCallIdUpdate(data.callId);
        }
      }
    });

    dataConnection.on("close", () => {
      webrtcLogger.persistLog(`Data connection closed with: ${peerId}`);
      this.handlePeerDisconnect(peerId);
    });

    dataConnection.on("error", (error) => {
      webrtcLogger.error(`Data connection error with ${peerId}:`, error);
    });
  }

  /**
   * Handle an incoming call from another peer
   * @param {MediaConnection} mediaConnection - The PeerJS media connection
   */
  handleIncomingCall(mediaConnection) {
    const peerId = mediaConnection.peer;

    if (!this.localStream) {
      webrtcLogger.error(
        `Received call from ${peerId} but no local stream available`
      );
      return;
    }

    // Answer the call with our local stream
    mediaConnection.answer(this.localStream);

    // Setup the media connection
    this.setupMediaConnection(mediaConnection);

    // Store the connection
    const existingConnection = this.connections.get(peerId);
    if (existingConnection) {
      existingConnection.media = mediaConnection;
    } else {
      this.connections.set(peerId, {
        data: null,
        media: mediaConnection,
      });
    }

    // Notify about new participant
    if (this.onParticipantJoined) {
      this.onParticipantJoined(peerId);
    }
  }

  /**
   * Setup a media connection with another peer
   * @param {MediaConnection} mediaConnection - The PeerJS media connection
   */
  setupMediaConnection(mediaConnection) {
    const peerId = mediaConnection.peer;

    mediaConnection.on("stream", (remoteStream) => {
      webrtcLogger.persistLog(`Received stream from: ${peerId}`);

      // Call the callback with the remote stream
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, remoteStream);
      } else {
        webrtcLogger.warn(
          `onRemoteStream callback not set when receiving stream from ${peerId}`
        );
      }
    });

    mediaConnection.on("close", () => {
      webrtcLogger.persistLog(`Media connection closed with: ${peerId}`);
      this.handlePeerDisconnect(peerId);
    });

    mediaConnection.on("error", (error) => {
      webrtcLogger.error(`Media connection error with ${peerId}:`, error);
    });
  }

  /**
   * Handle a peer disconnection
   * @param {string} peerId - The ID of the peer that disconnected
   */
  handlePeerDisconnect(peerId) {
    // Remove the connection
    this.connections.delete(peerId);

    // Notify about disconnection
    if (this.onUserDisconnected) {
      this.onUserDisconnected(peerId);
    }
  }

  /**
   * Handle a user joining the call
   * @param {Object} data - The user joined data
   */
  handleUserJoined(data) {
    try {
      // Extract data safely
      let fromUserId, globalStartTime, callId;

      if (typeof data === "string") {
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
        fromUserId = data.data.fromUserId;
        globalStartTime = data.data.globalStartTime;
        callId = data.data.callId;
      } else {
        fromUserId = data.fromUserId;
        globalStartTime = data.globalStartTime;
        callId = data.callId;
      }

      webrtcLogger.persistLog(`User ${fromUserId} joined the call`, data);

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

      // Connect to the new user if we have a local stream
      if (fromUserId && this.localStream) {
        this.connectToPeer(fromUserId);
      }

      // Notify about new participant
      if (this.onParticipantJoined) {
        this.onParticipantJoined(fromUserId);
      }
    } catch (error) {
      webrtcLogger.error("Error in handleUserJoined:", error);
    }
  }

  /**
   * Handle a user leaving the call
   * @param {Object} data - The user left data
   */
  handleUserLeft(data) {
    try {
      // Extract data safely
      let fromUserId;

      if (typeof data === "string") {
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
        fromUserId = data.data.fromUserId;
      } else {
        fromUserId = data.fromUserId;
      }

      webrtcLogger.persistLog(`User ${fromUserId} left the call`, data);

      // Close connection with the user
      const connection = this.connections.get(fromUserId);
      if (connection) {
        if (connection.data) connection.data.close();
        if (connection.media) connection.media.close();
        this.connections.delete(fromUserId);
      }

      // Notify about user disconnection
      if (this.onUserDisconnected) {
        this.onUserDisconnected(fromUserId);
      }
    } catch (error) {
      webrtcLogger.error("Error in handleUserLeft:", error);
    }
  }

  /**
   * Handle active call response
   * @param {Object} data - The active call response data
   */
  handleActiveCallResponse(data) {
    webrtcLogger.persistLog("Received active call response:", data);

    // Store the active call data for later use
    if (data && data.data) {
      this._activeCallData = data.data;
    }
  }

  /**
   * Connect to a peer
   * @param {string} peerId - The ID of the peer to connect to
   */
  connectToPeer(peerId) {
    try {
      webrtcLogger.persistLog(`Connecting to peer: ${peerId}`);

      // Create a data connection
      const dataConnection = this.peer.connect(peerId);
      this.setupDataConnection(dataConnection);

      // Create a media connection (call)
      if (this.localStream) {
        const mediaConnection = this.peer.call(peerId, this.localStream);
        this.setupMediaConnection(mediaConnection);

        // Store the connections
        this.connections.set(peerId, {
          data: dataConnection,
          media: mediaConnection,
        });
      } else {
        webrtcLogger.warn(
          `Cannot create media connection with ${peerId}: No local stream`
        );
      }
    } catch (error) {
      webrtcLogger.error(`Error connecting to peer ${peerId}:`, error);
    }
  }

  /**
   * Set the local media stream
   * @param {MediaStream} stream - The local media stream
   */
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

    this.localStream = stream;

    // Connect to existing peers with the new stream
    for (const [peerId, connection] of this.connections.entries()) {
      if (!connection.media && this.localStream) {
        const mediaConnection = this.peer.call(peerId, this.localStream);
        this.setupMediaConnection(mediaConnection);
        connection.media = mediaConnection;
      }
    }
  }

  /**
   * Join a call
   * @param {string} chatId - The ID of the chat
   * @param {Array} participants - The participants in the call
   * @param {string} callType - The type of call (audio/video)
   * @param {string} chatType - The type of chat (ls/chat/channel)
   * @param {boolean} isJoiningExistingCall - Whether joining an existing call
   */
  joinCall(
    chatId,
    participants,
    callType,
    chatType,
    isJoiningExistingCall = false
  ) {
    // Check if call recently ended
    const now = Date.now();
    const timeSinceLastCallEnd = now - this.lastCallEndTime;
    const recentlyEndedCall = timeSinceLastCallEnd < 5000; // 5 seconds
    const isSameChatAsLastCall = chatId === this.currentChatId;

    webrtcLogger.persistLog("Joining call:", {
      chatId,
      participants,
      callType,
      chatType,
      isJoiningExistingCall,
      timeSinceLastCallEnd,
      recentlyEndedCall,
      isSameChatAsLastCall,
    });

    // Prevent rejoining recently ended call
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

    // Store call information
    this.currentChatId = chatId;
    this.callType = callType;
    this.chatType = chatType;
    this.isJoiningExistingCall = isJoiningExistingCall;

    // Close existing connections
    this.closeAllConnections();

    // Initialize PeerJS if not already initialized
    if (!this.peer) {
      // We need the current user ID to initialize PeerJS
      // This should be available from the Redux store
      const userId = participants.find((p) => p.isSelf)?.id;

      if (!userId) {
        webrtcLogger.error("Cannot initialize PeerJS: User ID not found");
        return;
      }

      this.initializePeer(userId)
        .then(() => {
          // Notify server about joining the call
          this.notifyServerJoinCall(
            chatId,
            participants,
            callType,
            chatType,
            isJoiningExistingCall
          );
        })
        .catch((error) => {
          webrtcLogger.error("Error initializing PeerJS:", error);
          if (this.onCallError) {
            this.onCallError({
              message: `Error initializing call: ${error.message}`,
              type: "initialization_error",
              fatal: true,
            });
          }
        });
    } else {
      // Notify server about joining the call
      this.notifyServerJoinCall(
        chatId,
        participants,
        callType,
        chatType,
        isJoiningExistingCall
      );
    }
  }

  /**
   * Notify the server about joining a call
   * @param {string} chatId - The ID of the chat
   * @param {Array} participants - The participants in the call
   * @param {string} callType - The type of call (audio/video)
   * @param {string} chatType - The type of chat (ls/chat/channel)
   * @param {boolean} isJoiningExistingCall - Whether joining an existing call
   */
  notifyServerJoinCall(
    chatId,
    participants,
    callType,
    chatType,
    isJoiningExistingCall
  ) {
    try {
      websocketService.send({
        type: "webrtc_join_call",
        data: {
          chatId: chatId,
          participants: participants,
          callType: callType,
          chatType: chatType,
          isJoiningExistingCall: isJoiningExistingCall,
          clientTimestamp: Date.now(),
        },
      });
      webrtcLogger.persistLog("Join call request sent successfully");
    } catch (error) {
      webrtcLogger.error("Error sending join call request:", error);
      if (this.onCallError) {
        this.onCallError(error);
      }
    }
  }

  /**
   * Leave a call
   * @param {string} chatId - The ID of the chat
   */
  leaveCall(chatId) {
    webrtcLogger.persistLog("Leaving call:", chatId);

    // Remember the time of leaving
    this.lastCallEndTime = Date.now();
    webrtcLogger.log("Setting lastCallEndTime:", this.lastCallEndTime);

    // Close all connections
    this.closeAllConnections();

    // Release media streams
    if (this.localStream) {
      webrtcLogger.log("Stopping local media tracks");
      this.localStream.getTracks().forEach((track) => {
        webrtcLogger.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      this.localStream = null;
    }

    // Reset callbacks
    this.resetCallbacks();

    // Notify server about leaving
    try {
      websocketService.send({
        type: "webrtc_leave_call",
        data: {
          chatId: chatId,
          clientTimestamp: Date.now(),
        },
      });
      webrtcLogger.persistLog("Leave call request sent successfully");
    } catch (error) {
      webrtcLogger.error("Error sending leave call request:", error);
    }

    // Close PeerJS connection
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    for (const [peerId, connection] of this.connections.entries()) {
      webrtcLogger.log(`Closing connection with peer: ${peerId}`);
      if (connection.data) connection.data.close();
      if (connection.media) connection.media.close();
    }
    this.connections.clear();
  }

  /**
   * Reset all callbacks
   */
  resetCallbacks() {
    webrtcLogger.log("Resetting WebRTC callbacks");
    // Save reference to onCallError as it might be needed for error reporting
    const errorCallback = this.onCallError;

    this.onRemoteStream = null;
    this.onUserDisconnected = null;
    this.onCallStartTimeUpdate = null;
    this.onCallIdUpdate = null;
    this.onParticipantJoined = null;

    // Restore error callback
    this.onCallError = errorCallback;
  }

  /**
   * Check if there's an active call for a chat
   * @param {string} chatId - The ID of the chat
   * @returns {Promise} - Resolves with the active call data or null
   */
  checkActiveCall(chatId) {
    // Check if call recently ended
    const now = Date.now();
    const timeSinceLastCallEnd = now - this.lastCallEndTime;
    const recentlyEndedCall = timeSinceLastCallEnd < 5000; // 5 seconds
    const isSameChatAsLastCall = chatId === this.currentChatId;

    // If call in this chat recently ended, return null
    if (recentlyEndedCall && isSameChatAsLastCall) {
      webrtcLogger.persistLog(
        "Call recently ended, skipping active call check",
        {
          chatId,
          timeSinceLastCallEnd,
          lastCallEndTime: this.lastCallEndTime,
        }
      );
      return Promise.resolve(null);
    }

    // Keep track of pending requests to avoid duplicates
    if (
      this._pendingActiveCallChecks &&
      this._pendingActiveCallChecks[chatId]
    ) {
      webrtcLogger.log(
        `Already checking for active call in chat: ${chatId}, returning existing promise`
      );
      return this._pendingActiveCallChecks[chatId];
    }

    // Initialize tracking object if it doesn't exist
    if (!this._pendingActiveCallChecks) {
      this._pendingActiveCallChecks = {};
    }

    // Create promise for the request
    const promise = new Promise((resolve) => {
      webrtcLogger.persistLog(`Checking for active call in chat: ${chatId}`);

      // Create handler for the response
      const messageHandler = (message) => {
        websocketService.offMessage("active_call_response", messageHandler);

        // Clear the pending request
        if (this._pendingActiveCallChecks) {
          delete this._pendingActiveCallChecks[chatId];
        }

        webrtcLogger.log("Received active call response:", message);

        if (message.error) {
          webrtcLogger.error("Error in active call response:", message.error);
          resolve(null);
        } else {
          webrtcLogger.log("Active call data:", message.data);
          resolve(message.data);
        }
      };

      // Register handler for the response
      websocketService.onMessage("active_call_response", messageHandler);

      // Send request to check for active call
      try {
        websocketService.send({
          type: "check_active_call",
          data: {
            chatId: chatId,
            requestId: `check_${Date.now()}`, // Add a unique request ID for tracking
          },
        });
      } catch (error) {
        websocketService.offMessage("active_call_response", messageHandler);
        webrtcLogger.error("Error sending check_active_call request:", error);

        // Clear the pending request
        if (this._pendingActiveCallChecks) {
          delete this._pendingActiveCallChecks[chatId];
        }

        resolve(null);
      }

      // Set timeout to prevent hanging if no response
      setTimeout(() => {
        websocketService.offMessage("active_call_response", messageHandler);
        webrtcLogger.error(
          `Timeout checking for active call in chat: ${chatId}`
        );

        // Clear the pending request
        if (this._pendingActiveCallChecks) {
          delete this._pendingActiveCallChecks[chatId];
        }

        resolve(null);
      }, 10000); // 10 seconds timeout
    });

    // Store the promise
    this._pendingActiveCallChecks[chatId] = promise;

    return promise;
  }

  /**
   * Check browser support for WebRTC
   * @returns {Object} - Object with support information
   */
  checkBrowserSupport() {
    const result = {
      supported: true,
      details: {
        browser: navigator.userAgent,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        RTCPeerConnection: !!window.RTCPeerConnection,
        RTCSessionDescription: !!window.RTCSessionDescription,
        RTCIceCandidate: !!window.RTCIceCandidate,
      },
    };

    // Check basic WebRTC components
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

// Create and export service instance
export const peerJSService = new PeerJSService();

// Check WebRTC support on initialization
peerJSService.checkBrowserSupport();

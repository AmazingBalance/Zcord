# Video Call Implementation Plan

This document outlines the step-by-step implementation plan for fixing the video call functionality in the Zcord application.

## 1. Database Structure Fixes

### 1.1. Check and Fix Foreign Key Constraints

**Steps:**

1. Connect to the database and check the structure of the `chats` table:

   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'chats' AND column_name = 'id';
   ```

2. Check the structure of the `users` table:

   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'users' AND column_name = 'id';
   ```

3. Modify the `calls` and `call_participants` tables if needed:

   ```sql
   -- If chats.id is not VARCHAR(255)
   ALTER TABLE calls
   ALTER COLUMN chat_id TYPE [matching_type];

   -- If users.id is not VARCHAR(255)
   ALTER TABLE call_participants
   ALTER COLUMN user_id TYPE [matching_type];
   ```

### 1.2. Fix the `get_active_call` Function

**Steps:**

1. Update the function to handle NULL values properly:

   ```sql
   CREATE OR REPLACE FUNCTION get_active_call(p_chat_id VARCHAR(255))
   RETURNS TABLE (
       id INTEGER,
       chat_id VARCHAR(255),
       start_time TIMESTAMP,
       call_type VARCHAR(50),
       chat_type VARCHAR(50),
       participants JSON
   ) AS $$
   BEGIN
       RETURN QUERY
       SELECT
           c.id,
           c.chat_id,
           c.start_time,
           c.call_type,
           c.chat_type,
           COALESCE(
               (
                   SELECT json_agg(json_build_object(
                       'id', cp.user_id,
                       'join_time', cp.join_time
                   ))
                   FROM call_participants cp
                   WHERE cp.call_id = c.id AND cp.is_active = TRUE
               ),
               '[]'::json
           ) AS participants
       FROM calls c
       WHERE c.chat_id = p_chat_id AND c.is_active = TRUE
       LIMIT 1;
   END;
   $$ LANGUAGE plpgsql;
   ```

2. Test the function with a sample call:

   ```sql
   -- Insert a test call
   INSERT INTO calls (chat_id, start_time, call_type, chat_type, is_active)
   VALUES ('test_chat', NOW(), 'video', 'ls', TRUE)
   RETURNING id;

   -- Insert a test participant
   INSERT INTO call_participants (call_id, user_id, join_time, is_active)
   VALUES ([call_id], 'test_user', NOW(), TRUE);

   -- Test the function
   SELECT * FROM get_active_call('test_chat');

   -- Clean up
   DELETE FROM call_participants WHERE call_id = [call_id];
   DELETE FROM calls WHERE id = [call_id];
   ```

## 2. Logging Improvements

### 2.1. Server-side Logging

**Steps:**

1. Create a new file `logging.go` in the server directory:

   ```go
   package main

   import (
       "log"
       "os"
       "time"
       "fmt"
   )

   var (
       webrtcLogger *log.Logger
   )

   func initLogging() {
       // Create logs directory if it doesn't exist
       os.MkdirAll("logs", 0755)

       // Create WebRTC log file with timestamp
       timestamp := time.Now().Format("2006-01-02")
       webrtcLogFile, err := os.OpenFile(fmt.Sprintf("logs/webrtc_%s.log", timestamp), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
       if err != nil {
           log.Fatalf("Failed to open WebRTC log file: %v", err)
       }

       webrtcLogger = log.New(webrtcLogFile, "", log.Ldate|log.Ltime|log.Lmicroseconds)
   }

   func logWebRTC(format string, v ...interface{}) {
       webrtcLogger.Printf(format, v...)
   }
   ```

2. Initialize logging in `main.go`:

   ```go
   func main() {
       // Initialize logging
       initLogging()

       // ... rest of the function
   }
   ```

3. Add logging to WebRTC handlers in `websocket.go`:

   ```go
   func (c *Client) handleWebRTCJoinCall(data interface{}) {
       // ... existing code

       logWebRTC("User %s joining call for chat %s", c.userID, chatID)

       // ... rest of the function
   }

   func (c *Client) handleWebRTCLeaveCall(data interface{}) {
       // ... existing code

       logWebRTC("User %s leaving call for chat %s", c.userID, chatID)

       // ... rest of the function
   }

   func (c *Client) handleWebRTCOffer(data interface{}) {
       // ... existing code

       logWebRTC("User %s sending offer to %s", c.userID, webrtcMsg.TargetUserID)

       // ... rest of the function
   }

   func (c *Client) handleWebRTCAnswer(data interface{}) {
       // ... existing code

       logWebRTC("User %s sending answer to %s", c.userID, webrtcMsg.TargetUserID)

       // ... rest of the function
   }

   func (c *Client) handleWebRTCIceCandidate(data interface{}) {
       // ... existing code

       logWebRTC("User %s sending ICE candidate to %s", c.userID, webrtcMsg.TargetUserID)

       // ... rest of the function
   }

   func (c *Client) handleCheckActiveCall(data interface{}) {
       // ... existing code

       logWebRTC("User %s checking active call for chat %s", c.userID, chatID)

       // ... rest of the function
   }
   ```

### 2.2. Client-side Logging

**Steps:**

1. Create a new file `src/utils/logger.js`:

   ```javascript
   // Enable or disable debug logging
   const DEBUG = true;

   export const webrtcLogger = {
     log: (message, ...args) => {
       if (DEBUG) {
         console.log(`[WebRTC] ${message}`, ...args);
       }
     },
     error: (message, ...args) => {
       console.error(`[WebRTC] ${message}`, ...args);
     },
     warn: (message, ...args) => {
       console.warn(`[WebRTC] ${message}`, ...args);
     },
     // Log to localStorage for persistence
     persistLog: (message, ...args) => {
       if (typeof window !== "undefined" && window.localStorage) {
         const logs = JSON.parse(localStorage.getItem("webrtcLogs") || "[]");
         logs.push({
           timestamp: new Date().toISOString(),
           message,
           args: args.map((arg) => {
             try {
               return JSON.stringify(arg);
             } catch (e) {
               return String(arg);
             }
           }),
         });
         // Keep only the last 100 logs
         if (logs.length > 100) {
           logs.shift();
         }
         localStorage.setItem("webrtcLogs", JSON.stringify(logs));
       }
       webrtcLogger.log(message, ...args);
     },
   };

   // Helper to view logs
   export const viewWebRTCLogs = () => {
     if (typeof window !== "undefined" && window.localStorage) {
       return JSON.parse(localStorage.getItem("webrtcLogs") || "[]");
     }
     return [];
   };

   // Helper to clear logs
   export const clearWebRTCLogs = () => {
     if (typeof window !== "undefined" && window.localStorage) {
       localStorage.removeItem("webrtcLogs");
     }
   };
   ```

2. Update `src/services/webrtc.js` to use the logger:

   ```javascript
   import { webrtcLogger } from '../utils/logger';

   // ... existing code

   async createPeerConnection(userId, isInitiator = false) {
       webrtcLogger.persistLog(`Creating peer connection for user ${userId}, isInitiator: ${isInitiator}`);

       // ... rest of the function
   }

   setLocalStream(stream) {
       webrtcLogger.persistLog("Setting local stream:", {
           id: stream.id,
           active: stream.active,
           tracks: stream.getTracks().map(track => ({
               kind: track.kind,
               enabled: track.enabled,
               readyState: track.readyState,
               id: track.id
           }))
       });

       // ... rest of the function
   }

   // ... update other methods similarly
   ```

3. Update `src/components/VideoCall/VideoCall.jsx` to use the logger:

   ```javascript
   import { webrtcLogger } from "../../utils/logger";

   // ... existing code

   // Initialize local media stream and WebRTC service
   useEffect(() => {
     if (callState.isCallActive && !localStreamRef.current) {
       webrtcLogger.persistLog("Initializing local stream for call", {
         callId: callState.callId,
         chatId: callState.chatId,
         callType: callState.callType,
       });

       initializeLocalStream();

       // ... rest of the function
     }

     // ... rest of the function
   }, [callState.isCallActive, callState.chatId, dispatch]);
   ```

## 3. Timer Synchronization Fixes

### 3.1. Fix Time Format Conversion

**Steps:**

1. Update the server-side code to consistently use Unix timestamp in milliseconds:

   ```go
   // In handleWebRTCJoinCall function
   joinMsg := WebRTCMessage{
       Type:            MessageTypeWebRTCUserJoined,
       ChatID:          chatID,
       FromUserID:      c.userID,
       GlobalStartTime: startTime.UnixMilli(), // Ensure this is in milliseconds
   }
   ```

2. Update the client-side code to handle the time format properly:
   ```javascript
   // In VideoCall.jsx
   webrtcService.onCallStartTimeUpdate = (globalStartTime) => {
     webrtcLogger.persistLog("Received global call start time:", {
       globalStartTime,
       asDate: new Date(globalStartTime).toISOString(),
     });
     dispatch(setGlobalCallStartTime(globalStartTime));
   };
   ```

### 3.2. Add Logging for Timer Calculations

**Steps:**

1. Update the timer effect in `VideoCall.jsx`:

   ```javascript
   useEffect(() => {
     let interval;
     if (
       callState.callStatus === "connected" &&
       callState.globalCallStartTime
     ) {
       const updateDuration = () => {
         const now = Date.now();
         const startTime = callState.globalCallStartTime;

         webrtcLogger.log("Timer calculation:", {
           now,
           startTime,
           difference: now - startTime,
           formattedDifference: Math.floor((now - startTime) / 1000),
         });

         const elapsed = Math.floor((now - startTime) / 1000);
         setCallDuration(elapsed);
       };

       updateDuration(); // Update immediately
       interval = setInterval(updateDuration, 1000);
     } else {
       setCallDuration(0);
     }

     return () => {
       if (interval) clearInterval(interval);
     };
   }, [callState.callStatus, callState.globalCallStartTime]);
   ```

## 4. Video Streaming Fixes

### 4.1. Improve Stream Attachment

**Steps:**

1. Update the `onRemoteStream` callback in `VideoCall.jsx`:

   ```javascript
   webrtcService.onRemoteStream = (userId, stream) => {
     webrtcLogger.persistLog("Received remote stream from user:", userId, {
       streamId: stream.id,
       active: stream.active,
       tracks: stream.getTracks().map((track) => ({
         kind: track.kind,
         enabled: track.enabled,
         readyState: track.readyState,
         id: track.id,
       })),
     });

     remoteStreamsRef.current[userId] = stream;
     dispatch(addRemoteParticipant(userId));

     const videoElement = remoteVideosRef.current[userId];
     if (videoElement) {
       webrtcLogger.log("Attaching stream to video element for user:", userId);
       videoElement.srcObject = stream;

       // Add event listeners to debug video playback
       videoElement.onloadedmetadata = () => {
         webrtcLogger.log("Video metadata loaded for user:", userId);
         videoElement.play().catch((err) => {
           webrtcLogger.error("Error playing video:", err);
         });
       };

       videoElement.onerror = (err) => {
         webrtcLogger.error("Video element error for user:", userId, err);
       };
     } else {
       webrtcLogger.warn("No video element found for user:", userId);
     }
   };
   ```

2. Update the video element refs in the render function:
   ```jsx
   <video
     ref={(el) => {
       if (el) {
         const participantId = callState.remoteParticipants[0];
         remoteVideosRef.current[participantId] = el;

         // Set stream if already available
         if (remoteStreamsRef.current[participantId]) {
           webrtcLogger.log(
             "Setting stream on video element for user:",
             participantId
           );
           el.srcObject = remoteStreamsRef.current[participantId];

           // Add event listeners
           el.onloadedmetadata = () => {
             webrtcLogger.log("Video metadata loaded for user:", participantId);
             el.play().catch((err) => {
               webrtcLogger.error("Error playing video:", err);
             });
           };
         }
       }
     }}
     autoPlay
     playsInline
     className={styles.remoteVideo}
   />
   ```

### 4.2. Add Error Handling for Failed Connections

**Steps:**

1. Update the `createPeerConnection` method in `webrtc.js`:

   ```javascript
   async createPeerConnection(userId, isInitiator = false) {
       webrtcLogger.persistLog(`Creating peer connection for user ${userId}, isInitiator: ${isInitiator}`);

       try {
           const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
           this.peerConnections.set(userId, peerConnection);

           // Log connection state changes
           peerConnection.onconnectionstatechange = () => {
               webrtcLogger.persistLog(`Connection state for ${userId}:`, peerConnection.connectionState);
               if (
                   peerConnection.connectionState === "disconnected" ||
                   peerConnection.connectionState === "failed"
               ) {
                   webrtcLogger.error(`Connection failed for user ${userId}`);
                   this.onUserDisconnected?.(userId);
               }
           };

           peerConnection.oniceconnectionstatechange = () => {
               webrtcLogger.log(`ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
               if (
                   peerConnection.iceConnectionState === "failed" ||
                   peerConnection.iceConnectionState === "disconnected"
               ) {
                   webrtcLogger.error(`ICE connection failed for user ${userId}`);
                   // Try to restart ICE
                   if (isInitiator) {
                       this.restartIce(userId);
                   }
               }
           };

           // ... rest of the function

           return peerConnection;
       } catch (error) {
           webrtcLogger.error(`Error creating peer connection for user ${userId}:`, error);
           throw error;
       }
   }

   // Add a method to restart ICE
   async restartIce(userId) {
       webrtcLogger.persistLog(`Restarting ICE for user ${userId}`);

       const peerConnection = this.peerConnections.get(userId);
       if (!peerConnection) {
           webrtcLogger.warn(`No peer connection found for user ${userId}`);
           return;
       }

       try {
           const offer = await peerConnection.createOffer({ iceRestart: true });
           await peerConnection.setLocalDescription(offer);

           websocketService.send({
               type: "webrtc_offer",
               targetUserId: userId,
               offer: offer,
           });

           webrtcLogger.log(`ICE restart offer sent for user ${userId}`);
       } catch (error) {
           webrtcLogger.error(`Error restarting ICE for user ${userId}:`, error);
       }
   }
   ```

## 5. Audio Functionality Testing

### 5.1. Add Specific Logging for Audio Tracks

**Steps:**

1. Update the `setLocalStream` method in `webrtc.js`:

   ```javascript
   setLocalStream(stream) {
       webrtcLogger.persistLog("Setting local stream:", {
           id: stream.id,
           active: stream.active,
           tracks: stream.getTracks().map(track => ({
               kind: track.kind,
               enabled: track.enabled,
               readyState: track.readyState,
               id: track.id,
               constraints: track.getConstraints()
           }))
       });

       // Log audio tracks specifically
       const audioTracks = stream.getAudioTracks();
       if (audioTracks.length > 0) {
           webrtcLogger.log("Audio tracks:", audioTracks.map(track => ({
               id: track.id,
               enabled: track.enabled,
               muted: track.muted,
               readyState: track.readyState,
               constraints: track.getConstraints()
           })));
       } else {
           webrtcLogger.warn("No audio tracks found in stream");
       }

       this.localStream = stream;

       // ... rest of the function
   }
   ```

2. Update the `handleToggleAudio` method in `VideoCall.jsx`:
   ```javascript
   const handleToggleAudio = () => {
     if (localStreamRef.current) {
       const audioTracks = localStreamRef.current.getAudioTracks();
       webrtcLogger.persistLog("Toggling audio:", {
         audioTracks: audioTracks.map((track) => ({
           id: track.id,
           enabled: track.enabled,
           muted: track.muted,
           readyState: track.readyState,
         })),
         isAudioEnabled: callState.isAudioEnabled,
       });

       if (audioTracks.length > 0) {
         const audioTrack = audioTracks[0];
         audioTrack.enabled = !callState.isAudioEnabled;

         webrtcLogger.log("Audio track after toggle:", {
           id: audioTrack.id,
           enabled: audioTrack.enabled,
           muted: audioTrack.muted,
           readyState: audioTrack.readyState,
         });

         dispatch(toggleAudio());
       } else {
         webrtcLogger.warn("No audio tracks found");
       }
     } else {
       webrtcLogger.warn("No local stream available");
     }
   };
   ```

### 5.2. Test Audio-Only Fallback

**Steps:**

1. Update the audio fallback in `initializeLocalStream` in `VideoCall.jsx`:
   ```javascript
   // Try audio-only fallback if video failed
   if (callState.callType === "video" && error.name !== "NotAllowedError") {
     webrtcLogger.persistLog("Attempting audio-only fallback");

     try {
       const audioConstraints = {
         audio: {
           echoCancellation: true,
           noiseSuppression: true,
           autoGainControl: true,
         },
       };

       webrtcLogger.log("Audio constraints:", audioConstraints);

       const audioStream = await navigator.mediaDevices.getUserMedia(
         audioConstraints
       );

       webrtcLogger.log("Audio stream obtained:", {
         id: audioStream.id,
         active: audioStream.active,
         tracks: audioStream.getTracks().map((track) => ({
           kind: track.kind,
           enabled: track.enabled,
           readyState: track.readyState,
           id: track.id,
         })),
       });

       localStreamRef.current = audioStream;

       // Set local stream in WebRTC service
       webrtcService.setLocalStream(audioStream);

       dispatch(setCallStatus("connected"));
       dispatch(setCallError("Видео недоступно, используется только аудио"));
     } catch (audioError) {
       webrtcLogger.error("Audio fallback failed:", audioError);
     }
   }
   ```

## 6. Testing Plan

### 6.1. Create a Test Script

**Steps:**

1. Create a file `video_call_test.md` with test scenarios:

   ```markdown
   # Video Call Testing Script

   ## Prerequisites

   - Two or more users logged in on different browsers/devices
   - Network connection stable
   - Camera and microphone permissions granted

   ## Test Scenarios

   ### 1. Basic Call Functionality

   #### 1.1. Starting a Call

   1. User A navigates to a chat with User B
   2. User A clicks the call button
   3. **Expected:** Call UI appears with local video
   4. **Expected:** Timer starts at 00:00
   5. **Expected:** System message appears in chat

   #### 1.2. Joining an Existing Call

   1. With User A in a call, User B navigates to the same chat
   2. **Expected:** User B sees indication of active call
   3. User B clicks the call button
   4. **Expected:** Call UI appears with both videos
   5. **Expected:** Timer shows correct elapsed time
   6. **Expected:** System message shows User B joined

   #### 1.3. Media Controls

   1. User A toggles video off
   2. **Expected:** User A's video disappears for both users
   3. User A toggles video on
   4. **Expected:** User A's video reappears for both users
   5. User B toggles audio off
   6. **Expected:** User B's audio is muted for User A
   7. User B toggles audio on
   8. **Expected:** User B's audio is unmuted for User A

   #### 1.4. Leaving a Call

   1. User B clicks end call
   2. **Expected:** User B's video disappears for User A
   3. **Expected:** System message shows User B left
   4. **Expected:** User A remains in call

   #### 1.5. Ending a Call

   1. User A clicks end call
   2. **Expected:** Call UI disappears
   3. **Expected:** System message shows call ended with duration

   ### 2. Error Handling

   #### 2.1. Permission Denial

   1. User C denies camera/microphone permissions
   2. User C tries to join a call
   3. **Expected:** Error message about permissions
   4. **Expected:** Option to retry with permissions

   #### 2.2. Network Issues

   1. User A and B are in a call
   2. Simulate network interruption for User A
   3. **Expected:** Connection status indicates issue
   4. **Expected:** Attempt to reconnect
   5. **Expected:** Either reconnect or show error

   ### 3. Edge Cases

   #### 3.1. Multiple Participants

   1. Users A, B, and C join the same group call
   2. **Expected:** All users can see and hear each other
   3. **Expected:** UI properly displays all participants

   #### 3.2. Rejoining After Disconnect

   1. User A and B are in a call
   2. User A closes browser and reopens
   3. User A navigates back to the chat
   4. **Expected:** User A can rejoin the call
   5. **Expected:** Timer continues from original start time
   ```

### 6.2. Implement a Debug UI

**Steps:**

1. Create a simple debug UI component:

   ```jsx
   // src/components/VideoCall/VideoCallDebug.jsx
   import React, { useState } from "react";
   import { viewWebRTCLogs, clearWebRTCLogs } from "../../utils/logger";
   import styles from "./styles.module.css";

   export default function VideoCallDebug() {
     const [showLogs, setShowLogs] = useState(false);
     const [logs, setLogs] = useState([]);

     const handleViewLogs = () => {
       setLogs(viewWebRTCLogs());
       setShowLogs(true);
     };

     const handleClearLogs = () => {
       clearWebRTCLogs();
       setLogs([]);
     };

     if (!showLogs) {
       return (
         <div className={styles.debugButton}>
           <button onClick={handleViewLogs}>Debug</button>
         </div>
       );
     }

     return (
       <div className={styles.debugPanel}>
         <div className={styles.debugHeader}>
           <h3>WebRTC Debug Logs</h3>
           <div>
             <button onClick={() => setShowLogs(false)}>Close</button>
             <button onClick={handleClearLogs}>Clear Logs</button>
           </div>
         </div>
         <div className={styles.debugContent}>
           {logs.length === 0 ? (
             <p>No logs available</p>
           ) : (
             <ul>
               {logs.map((log, index) => (
                 <li key={index}>
                   <span className={styles.timestamp}>{log.timestamp}</span>
                   <span className={styles.message}>{log.message}</span>
                   {log.args.map((arg, i) => (
                     <pre key={i}>{arg}</pre>
                   ))}
                 </li>
               ))}
             </ul>
           )}
         </div>
       </div>
     );
   }
   ```

2. Add the debug component to the VideoCall component:

   ```jsx
   // In VideoCall.jsx
   import VideoCallDebug from "./VideoCallDebug";

   // ... existing code

   return (
     <div
       className={`${styles.videoCallOverlay} ${
         isMinimized ? styles.minimized : ""
       }`}
     >
       {/* ... existing code */}

       {process.env.NODE_ENV !== "production" && <VideoCallDebug />}
     </div>
   );
   ```

## 7. Implementation Timeline

1. **Day 1: Database and Logging**

   - Fix database tables and functions
   - Implement server-side logging
   - Implement client-side logging

2. **Day 2: Timer and Video Streaming**

   - Fix timer synchronization
   - Improve video stream attachment
   - Add error handling for connections

3. **Day 3: Testing and Debugging**
   - Implement debug UI
   - Test all functionality
   - Fix any remaining issues

## 8. Deployment Considerations

1. **Database Migration**

   - Create a migration script to apply database changes
   - Test migration on a staging environment first

2. **Backward Compatibility**

   - Ensure changes don't break existing functionality
   - Keep in-memory structures for backward compatibility

3. **Monitoring**
   - Set up monitoring for WebRTC connections
   - Monitor call quality metrics
   - Set up alerts for failed calls

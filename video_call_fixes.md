# Video Call Functionality Fixes

## Database Structure Issues

### Current Issues

1. **Foreign Key Constraints**: The `calls` table has a foreign key constraint on `chat_id` referencing `chats(id)`. We need to ensure the data types match.
2. **Data Format**: The `get_active_call` function might not be returning data in the format expected by the client.

### Recommended Fixes

```sql
-- Check the structure of the chats table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'chats' AND column_name = 'id';

-- If needed, modify the calls table to match the chats table id type
ALTER TABLE calls
ALTER COLUMN chat_id TYPE <matching_type>;

-- Fix the get_active_call function to ensure it returns the correct format
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

## Timer Synchronization Issues

### Current Issues

1. **Time Format**: The server sends timestamps in milliseconds, but the client might be expecting a different format.
2. **Synchronization**: The `globalCallStartTime` might not be properly synchronized between server and client.

### Recommended Fixes

1. **Server-side**: Ensure the server consistently uses Unix timestamp in milliseconds:

```go
// In handleWebRTCJoinCall function
joinMsg := WebRTCMessage{
    Type:            MessageTypeWebRTCUserJoined,
    ChatID:          chatID,
    FromUserID:      c.userID,
    GlobalStartTime: startTime.UnixMilli(), // Ensure this is in milliseconds
}
```

2. **Client-side**: Add more logging to debug time synchronization:

```javascript
// In VideoCall.jsx
useEffect(() => {
  let interval;
  if (callState.callStatus === "connected" && callState.globalCallStartTime) {
    const updateDuration = () => {
      const now = Date.now();
      const startTime = callState.globalCallStartTime;
      console.log("Timer calculation:", {
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

## Video Streaming Issues

### Current Issues

1. **Stream Attachment**: The video streams might not be properly attached to the video elements.
2. **WebRTC Connection**: There might be issues with the WebRTC connection establishment.

### Recommended Fixes

1. **Improve Stream Attachment**:

```javascript
// In VideoCall.jsx
webrtcService.onRemoteStream = (userId, stream) => {
  console.log("Received remote stream from user:", userId, stream);
  console.log(
    "Stream tracks:",
    stream.getTracks().map((track) => ({
      kind: track.kind,
      enabled: track.enabled,
      readyState: track.readyState,
      id: track.id,
    }))
  );

  remoteStreamsRef.current[userId] = stream;
  dispatch(addRemoteParticipant(userId));

  const videoElement = remoteVideosRef.current[userId];
  if (videoElement) {
    console.log("Attaching stream to video element for user:", userId);
    videoElement.srcObject = stream;

    // Add event listeners to debug video playback
    videoElement.onloadedmetadata = () => {
      console.log("Video metadata loaded for user:", userId);
      videoElement.play().catch((err) => {
        console.error("Error playing video:", err);
      });
    };

    videoElement.onerror = (err) => {
      console.error("Video element error for user:", userId, err);
    };
  } else {
    console.warn("No video element found for user:", userId);
  }
};
```

2. **Improve WebRTC Connection**:

```javascript
// In webrtc.js
async createPeerConnection(userId, isInitiator = false) {
    console.log(`Creating peer connection for user ${userId}, isInitiator: ${isInitiator}`);

    const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
    this.peerConnections.set(userId, peerConnection);

    // Log connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state for ${userId}:`, peerConnection.connectionState);
        // ...
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${userId}:`, peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log(`ICE gathering state for ${userId}:`, peerConnection.iceGatheringState);
    };

    peerConnection.onsignalingstatechange = () => {
        console.log(`Signaling state for ${userId}:`, peerConnection.signalingState);
    };

    // ... rest of the function
}
```

## Comprehensive Logging

### Server-side Logging

Create a dedicated log file for WebRTC-related operations:

```go
// In main.go or a new logging.go file
package main

import (
    "log"
    "os"
    "time"
)

var (
    webrtcLogger *log.Logger
)

func initLogging() {
    // Create WebRTC log file
    webrtcLogFile, err := os.OpenFile("webrtc.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
    if err != nil {
        log.Fatalf("Failed to open WebRTC log file: %v", err)
    }

    webrtcLogger = log.New(webrtcLogFile, "", log.Ldate|log.Ltime|log.Lmicroseconds)
}

func logWebRTC(format string, v ...interface{}) {
    webrtcLogger.Printf(format, v...)
}
```

Then use this logger in the WebRTC handlers:

```go
// In handleWebRTCJoinCall
func (c *Client) handleWebRTCJoinCall(data interface{}) {
    logWebRTC("User %s joining call for chat %s", c.userID, chatID)
    // ...
}
```

### Client-side Logging

Create a dedicated logger for WebRTC operations:

```javascript
// In a new file: src/utils/logger.js
export const webrtcLogger = {
  log: (message, ...args) => {
    console.log(`[WebRTC] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[WebRTC] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WebRTC] ${message}`, ...args);
  },
};
```

Then use this logger in the WebRTC service:

```javascript
// In webrtc.js
import { webrtcLogger } from '../utils/logger';

// ...

handleUserJoined(data) {
    // ...
    webrtcLogger.log(`User ${fromUserId} joined the call`, data);
    // ...
}
```

## Testing Plan

1. **Basic Functionality**:

   - Start a call
   - Join an existing call
   - Leave a call
   - End a call

2. **Media Handling**:

   - Test video streaming
   - Test audio streaming
   - Test muting/unmuting audio
   - Test enabling/disabling video

3. **Error Handling**:

   - Test what happens when camera/microphone permissions are denied
   - Test what happens when the network connection is lost
   - Test what happens when a user joins with no camera

4. **Multiple Users**:
   - Test with 2 users
   - Test with 3+ users
   - Test users joining and leaving at different times

## Implementation Steps

1. **Database Fixes**:

   - Check and fix foreign key constraints
   - Update the `get_active_call` function

2. **Logging Improvements**:

   - Set up server-side logging
   - Set up client-side logging

3. **Timer Synchronization**:

   - Fix time format conversion
   - Add logging for timer calculations

4. **Video Streaming**:

   - Improve stream attachment
   - Add error handling for failed connections

5. **Testing**:
   - Test all functionality with the fixes

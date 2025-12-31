# Video Call Testing Script

This document provides a comprehensive testing script for the video call functionality in the Zcord application. Follow these steps to thoroughly test all aspects of the video call feature after implementing the fixes.

## Prerequisites

- Two or more users logged in on different browsers/devices
- Network connection stable
- Camera and microphone permissions granted
- Debug logging enabled

## Test Scenarios

### 1. Basic Call Functionality

#### 1.1. Starting a Call

**Steps:**

1. User A navigates to a chat with User B
2. User A clicks the call button
3. Verify that User A's camera and microphone permissions are requested (if not already granted)
4. Verify that the call UI appears with User A's local video
5. Verify that the timer starts at 00:00 and increments properly
6. Verify that a system message appears in the chat indicating that User A started a call

**Expected Results:**

- Call UI should appear with the local video
- Timer should start at 00:00 and increment properly
- A system message should appear in the chat

**Debug Information to Check:**

- Check WebRTC logs for successful media device access
- Verify that the call record is created in the database
- Check that the global start time is set correctly

#### 1.2. Joining an Existing Call

**Steps:**

1. With User A already in a call, User B navigates to the same chat
2. Verify that User B sees an indication that an active call is in progress
3. User B clicks the call button to join the existing call
4. Verify that User B's camera and microphone permissions are requested (if not already granted)
5. Verify that the call UI appears with both User A's and User B's videos
6. Verify that the timer shows the correct elapsed time since the call started
7. Verify that a system message appears in the chat indicating that User B joined the call

**Expected Results:**

- Call UI should appear with both local and remote videos
- Timer should show the correct elapsed time (synchronized with the call start time)
- A system message should appear in the chat

**Debug Information to Check:**

- Check WebRTC logs for successful peer connection establishment
- Verify that User B is added to the call participants in the database
- Check that the global start time is correctly synchronized

#### 1.3. Media Controls

**Steps:**

1. User A toggles video off by clicking the video button
2. Verify that User A's video disappears for both User A and User B
3. User A toggles video on by clicking the video button again
4. Verify that User A's video reappears for both User A and User B
5. User B toggles audio off by clicking the audio button
6. Verify that User B's audio is muted for User A
7. User B toggles audio on by clicking the audio button again
8. Verify that User B's audio is unmuted for User A

**Expected Results:**

- Video toggle should work correctly for both users
- Audio toggle should work correctly for both users

**Debug Information to Check:**

- Check WebRTC logs for track enabled/disabled events
- Verify that the media tracks are properly manipulated

#### 1.4. Leaving a Call

**Steps:**

1. With both User A and User B in a call, User B clicks the end call button
2. Verify that User B's video disappears from User A's call UI
3. Verify that a system message appears in the chat indicating that User B left the call
4. Verify that User A can continue the call

**Expected Results:**

- User B should be removed from the call
- A system message should appear in the chat
- User A should still be in the call

**Debug Information to Check:**

- Check WebRTC logs for peer connection closure
- Verify that User B is marked as inactive in the call participants in the database
- Check that the call record is still active

#### 1.5. Ending a Call

**Steps:**

1. With User A as the only participant in a call, User A clicks the end call button
2. Verify that the call UI disappears
3. Verify that a system message appears in the chat indicating that the call ended with the correct duration

**Expected Results:**

- Call UI should disappear
- A system message should appear in the chat with the correct call duration

**Debug Information to Check:**

- Check WebRTC logs for call termination
- Verify that the call record is marked as inactive in the database
- Check that the call duration is calculated correctly

### 2. Error Handling

#### 2.1. Permission Denial

**Steps:**

1. User C denies camera and/or microphone permissions
2. User C tries to join a call
3. Verify that an error message is displayed about missing permissions
4. Verify that an option to retry with permissions is provided

**Expected Results:**

- Error message should be displayed
- Option to retry should be provided

**Debug Information to Check:**

- Check WebRTC logs for permission denial errors
- Verify that the error handling code is executed

#### 2.2. Audio-Only Fallback

**Steps:**

1. User D has a camera that is not working or is in use by another application
2. User D tries to join a video call
3. Verify that an error message is displayed about the camera issue
4. Verify that the call falls back to audio-only mode
5. Verify that User D can still participate in the call with audio only

**Expected Results:**

- Error message should be displayed
- Call should fall back to audio-only mode
- User D should be able to participate with audio only

**Debug Information to Check:**

- Check WebRTC logs for camera access errors
- Verify that the audio-only fallback code is executed
- Check that the audio stream is properly created and shared

#### 2.3. Network Issues

**Steps:**

1. User A and User B are in a call
2. Simulate network interruption for User A (e.g., by temporarily disabling the network connection)
3. Verify that the connection status indicates an issue
4. Verify that the application attempts to reconnect
5. Restore the network connection
6. Verify that the call is either reconnected or an error is shown

**Expected Results:**

- Connection status should indicate an issue
- Application should attempt to reconnect
- Call should either reconnect or show an error

**Debug Information to Check:**

- Check WebRTC logs for ICE connection state changes
- Verify that the ICE restart code is executed
- Check that the peer connection is properly handled during network issues

### 3. Edge Cases

#### 3.1. Multiple Participants

**Steps:**

1. Create a group chat with Users A, B, and C
2. User A starts a call
3. Users B and C join the call
4. Verify that all users can see and hear each other
5. Verify that the UI properly displays all participants
6. User B leaves the call
7. Verify that Users A and C can still continue the call
8. User C leaves the call
9. Verify that User A can still continue the call
10. User A ends the call

**Expected Results:**

- All users should be able to see and hear each other
- UI should properly display all participants
- Call should continue when users leave

**Debug Information to Check:**

- Check WebRTC logs for multiple peer connections
- Verify that all participants are properly added to the call record in the database
- Check that the media streams are properly handled for multiple participants

#### 3.2. Rejoining After Disconnect

**Steps:**

1. User A and User B are in a call
2. User A closes the browser tab
3. User A reopens the browser and navigates back to the chat
4. Verify that User A sees an indication that an active call is in progress
5. User A clicks the call button to rejoin the call
6. Verify that User A can rejoin the call
7. Verify that the timer continues from the original start time

**Expected Results:**

- User A should be able to rejoin the call
- Timer should continue from the original start time

**Debug Information to Check:**

- Check WebRTC logs for reconnection
- Verify that User A is properly added back to the call participants in the database
- Check that the global start time is correctly synchronized

#### 3.3. Browser Compatibility

**Steps:**

1. Test the video call functionality in different browsers:
   - Chrome
   - Firefox
   - Safari
   - Edge
2. Verify that the call works correctly in all supported browsers

**Expected Results:**

- Call should work correctly in all supported browsers

**Debug Information to Check:**

- Check WebRTC logs for browser-specific issues
- Verify that the media constraints are properly handled for different browsers

### 4. Performance Testing

#### 4.1. Long Duration Calls

**Steps:**

1. User A and User B start a call
2. Keep the call active for at least 30 minutes
3. Verify that the call remains stable
4. Verify that the timer continues to increment correctly
5. Verify that the audio and video quality remain acceptable

**Expected Results:**

- Call should remain stable for long durations
- Timer should continue to increment correctly
- Audio and video quality should remain acceptable

**Debug Information to Check:**

- Check WebRTC logs for any degradation over time
- Monitor memory usage to ensure there are no leaks
- Check that the peer connection remains stable

#### 4.2. Resource Usage

**Steps:**

1. User A and User B start a call
2. Monitor CPU and memory usage during the call
3. Verify that the resource usage is reasonable and does not increase significantly over time

**Expected Results:**

- CPU and memory usage should be reasonable
- Resource usage should not increase significantly over time

**Debug Information to Check:**

- Monitor CPU and memory usage
- Check for any memory leaks
- Verify that media streams are properly disposed when no longer needed

## Test Results Template

Use the following template to record test results:

```
# Video Call Test Results

Date: [Date]
Tester: [Name]
Environment: [Browser/OS]

## Test Scenario: [Scenario Name]

### Steps Performed:
1. [Step 1]
2. [Step 2]
...

### Expected Results:
- [Expected Result 1]
- [Expected Result 2]
...

### Actual Results:
- [Actual Result 1]
- [Actual Result 2]
...

### Debug Information:
- [Debug Info 1]
- [Debug Info 2]
...

### Issues Found:
- [Issue 1]
- [Issue 2]
...

### Screenshots/Recordings:
- [Link to Screenshot/Recording 1]
- [Link to Screenshot/Recording 2]
...

### Additional Notes:
[Any additional notes or observations]
```

## Troubleshooting Common Issues

### 1. No Video/Audio

**Possible Causes:**

- Camera/microphone permissions denied
- Camera/microphone in use by another application
- Media constraints not supported by the device
- WebRTC not supported by the browser

**Troubleshooting Steps:**

1. Check browser console for permission errors
2. Verify that the camera/microphone is not in use by another application
3. Try with different media constraints
4. Check browser compatibility

### 2. Connection Issues

**Possible Causes:**

- Network connectivity problems
- STUN/TURN server issues
- Firewall blocking WebRTC traffic
- NAT traversal issues

**Troubleshooting Steps:**

1. Check network connectivity
2. Verify that STUN/TURN servers are accessible
3. Check firewall settings
4. Try with different network conditions

### 3. Timer Synchronization Issues

**Possible Causes:**

- Time format mismatch between server and client
- Clock skew between devices
- Race conditions in timer updates

**Troubleshooting Steps:**

1. Check the format of the global start time
2. Verify that the time is properly converted between server and client
3. Add more logging around timer calculations

### 4. Database Issues

**Possible Causes:**

- Foreign key constraints not matching
- Data type mismatches
- SQL errors in stored procedures

**Troubleshooting Steps:**

1. Check database schema
2. Verify that foreign key constraints are correct
3. Test stored procedures with sample data

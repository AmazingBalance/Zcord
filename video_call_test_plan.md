# Video Call Testing Plan

This document outlines the testing plan for the video call functionality in the Zcord application.

## Prerequisites

1. Apply the database changes using the `apply_call_changes.sh` script
2. Restart the server
3. Have at least two browser windows open with different user accounts logged in

## Test Cases

### Test Case 1: Starting a New Call

**Steps:**

1. Log in as User A
2. Navigate to a chat with User B
3. Click the call button to start a new call
4. Verify that the call UI appears
5. Verify that the timer starts at 00:00
6. Verify that a system message appears in the chat indicating that User A started a call

**Expected Results:**

- Call UI should appear with the local video
- Timer should start at 00:00 and increment properly
- A system message should appear in the chat

### Test Case 2: Joining an Existing Call

**Steps:**

1. With User A already in a call, log in as User B
2. Navigate to the same chat
3. Verify that the UI indicates an active call
4. Click the call button to join the existing call
5. Verify that the call UI appears
6. Verify that the timer shows the correct elapsed time since the call started
7. Verify that a system message appears in the chat indicating that User B joined the call

**Expected Results:**

- Call UI should appear with both local and remote videos
- Timer should show the correct elapsed time (synchronized with the call start time)
- A system message should appear in the chat

### Test Case 3: Leaving a Call

**Steps:**

1. With both User A and User B in a call, click the end call button as User B
2. Verify that User B's video disappears from User A's call UI
3. Verify that a system message appears in the chat indicating that User B left the call
4. Verify that User A can continue the call

**Expected Results:**

- User B should be removed from the call
- A system message should appear in the chat
- User A should still be in the call

### Test Case 4: Ending a Call

**Steps:**

1. With User A as the only participant in a call, click the end call button
2. Verify that the call UI disappears
3. Verify that a system message appears in the chat indicating that the call ended with the correct duration

**Expected Results:**

- Call UI should disappear
- A system message should appear in the chat with the correct call duration

### Test Case 5: Rejoining a Call After Disconnection

**Steps:**

1. With User A and User B in a call, close the browser tab for User B
2. Reopen the browser and log in as User B
3. Navigate to the same chat
4. Verify that the UI indicates an active call
5. Click the call button to rejoin the call
6. Verify that the call UI appears with the correct timer value

**Expected Results:**

- User B should be able to rejoin the call
- Timer should show the correct elapsed time

## Additional Tests

### Audio/Video Controls

- Test muting/unmuting audio
- Test enabling/disabling video
- Test minimizing/maximizing the call UI

### Error Handling

- Test what happens when camera/microphone permissions are denied
- Test what happens when the network connection is lost

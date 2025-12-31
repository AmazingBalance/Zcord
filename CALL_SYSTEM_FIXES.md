# Call System Fixes

This document describes the fixes applied to the call system in Zcord.

## Issues Fixed

1. **Timeout Error When Joining Existing Calls**: New users were unable to join existing calls in a chat due to timeout errors.
2. **Ambiguous Column References in SQL Functions**: The SQL functions had ambiguous column references that caused errors.
3. **Stuck Call Records**: There were stuck call records in the database that needed to be cleaned up.

## Fixes Applied

### 1. Client-Side Fixes

The WebRTC service in `src/services/webrtc.js` has been modified to:

- Increase the timeout from 10 seconds to 30 seconds
- Add retry logic with up to 3 attempts before giving up
- Improve error handling and logging

These changes ensure that users have enough time to find and join existing calls, and that the system gracefully handles any errors that occur.

### 2. Database Fixes

The following database fixes have been applied:

#### 2.1. Cleaned Up Existing Call Records

All active calls and call participants have been marked as inactive to clean up any stuck records.

#### 2.2. Fixed the `join_call` Function

The `join_call` function has been fixed to resolve ambiguous column references:

- Qualified column names with table aliases
- Used column aliases in the RETURNING clause
- Used a different approach to handle ON CONFLICT

#### 2.3. Fixed the `leave_call` Function

The `leave_call` function has been fixed to resolve ambiguous column references:

- Qualified column names with table aliases
- Used table aliases in the WHERE clause

#### 2.4. Optimized the `get_active_call` Function

The `get_active_call` function has been optimized for better performance:

- Added a statement timeout to prevent long-running queries
- Used table aliases for clarity

#### 2.5. Added Indexes for Better Performance

The following indexes have been added for better performance:

- `idx_calls_chat_id_is_active` on `calls(chat_id, is_active)`
- `idx_call_participants_call_id_is_active` on `call_participants(call_id, is_active)`

### 3. Testing

A test script (`test_call_system.sh`) has been created to verify that the call system is working correctly. The script tests:

- Database connection
- Call tables and functions
- Call creation
- Active call check
- Call leaving
- Call cleanup

## How to Apply the Fixes

1. Run the `apply_call_system_fixes.sh` script to apply all the fixes:

```bash
./apply_call_system_fixes.sh
```

2. Follow the prompts to restart the server and client if needed.

3. Test the call system by following these steps:
   - Open the application in two different browsers or browser tabs
   - Log in with two different accounts
   - Navigate to the same chat in both browsers
   - Initiate a call from one browser
   - Join the call from the other browser
   - Verify that audio and video are working correctly
   - Leave the call from both browsers
   - Verify that the call is properly ended

## Conclusion

These fixes should resolve the issues with the call system, allowing new users to join existing calls without timeout errors. The database functions have been optimized for better performance, and all stuck call records have been cleaned up.

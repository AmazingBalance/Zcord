package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/pion/webrtc/v3"
)

// WebRTCManager handles WebRTC connections and signaling
type WebRTCManager struct {
	// Map of user ID to peer connections
	peerConnections     map[string]map[string]*webrtc.PeerConnection
	peerConnectionsLock sync.RWMutex

	// Map of call ID to call information
	activeCalls     map[string]*CallSession
	activeCallsLock sync.RWMutex

	// WebRTC configuration
	config webrtc.Configuration
}

// CallSession represents an active call
type CallSession struct {
	CallID        string                 `json:"callId"`
	ChatID        string                 `json:"chatId"`
	StartTime     time.Time              `json:"startTime"`
	CallType      string                 `json:"callType"` // "audio" or "video"
	ChatType      string                 `json:"chatType"` // "ls", "chat", or "channel"
	Participants  map[string]interface{} `json:"participants"`
	IsActive      bool                   `json:"isActive"`
	participantsMu sync.RWMutex
}

// NewWebRTCManager creates a new WebRTC manager
func NewWebRTCManager() *WebRTCManager {
	// Create a new WebRTC configuration with ICE servers
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{"stun:stun.l.google.com:19302"},
			},
			{
				URLs: []string{"stun:stun1.l.google.com:19302"},
			},
			{
				URLs: []string{
					"turn:openrelay.metered.ca:80",
					"turn:openrelay.metered.ca:443",
					"turn:openrelay.metered.ca:443?transport=tcp",
				},
				Username:   "openrelayproject",
				Credential: "openrelayproject",
			},
		},
	}

	return &WebRTCManager{
		peerConnections: make(map[string]map[string]*webrtc.PeerConnection),
		activeCalls:     make(map[string]*CallSession),
		config:          config,
	}
}

// HandleJoinCall handles a user joining a call
func (m *WebRTCManager) HandleJoinCall(userID, chatID, callType, chatType string, participants []interface{}) (int, time.Time, bool, error) {
	// Check if there's an active call in this chat
	m.activeCallsLock.RLock()
	callSession, exists := m.findCallByChat(chatID)
	m.activeCallsLock.RUnlock()

	var callID int
	var startTime time.Time
	var isNewCall bool

	if !exists {
		// Create a new call in the database
		var err error
		callID, startTime, err = createCallInDB(chatID, callType, chatType)
		if err != nil {
			return 0, time.Time{}, false, fmt.Errorf("failed to create call in database: %w", err)
		}

		// Create a new call session
		callSession = &CallSession{
			CallID:       fmt.Sprintf("%d", callID),
			ChatID:       chatID,
			StartTime:    startTime,
			CallType:     callType,
			ChatType:     chatType,
			Participants: make(map[string]interface{}),
			IsActive:     true,
		}

		// Add the call session to the active calls map
		m.activeCallsLock.Lock()
		m.activeCalls[chatID] = callSession
		m.activeCallsLock.Unlock()

		isNewCall = true
	} else {
		// Parse the existing call ID
		fmt.Sscanf(callSession.CallID, "%d", &callID)
		startTime = callSession.StartTime
		isNewCall = false
	}

	// Add the user to the call participants
	callSession.participantsMu.Lock()
	callSession.Participants[userID] = struct {
		JoinTime time.Time `json:"joinTime"`
	}{
		JoinTime: time.Now(),
	}
	callSession.participantsMu.Unlock()

	// Add the user to the call participants in the database
	err := addParticipantToDB(callID, userID)
	if err != nil {
		log.Printf("Failed to add participant to database: %v", err)
	}

	// Initialize peer connections map for this user if it doesn't exist
	m.peerConnectionsLock.Lock()
	if _, exists := m.peerConnections[userID]; !exists {
		m.peerConnections[userID] = make(map[string]*webrtc.PeerConnection)
	}
	m.peerConnectionsLock.Unlock()

	return callID, startTime, isNewCall, nil
}

// HandleLeaveCall handles a user leaving a call
func (m *WebRTCManager) HandleLeaveCall(userID, chatID string) (int, int, error) {
	// Check if there's an active call in this chat
	m.activeCallsLock.RLock()
	callSession, exists := m.findCallByChat(chatID)
	m.activeCallsLock.RUnlock()

	if !exists {
		return 0, 0, fmt.Errorf("no active call found in chat %s", chatID)
	}

	// Parse the call ID
	var callID int
	fmt.Sscanf(callSession.CallID, "%d", &callID)

	// Remove the user from the call participants
	callSession.participantsMu.Lock()
	delete(callSession.Participants, userID)
	remainingParticipants := len(callSession.Participants)
	callSession.participantsMu.Unlock()

	// Remove the user from the call participants in the database
	err := removeParticipantFromDB(callID, userID)
	if err != nil {
		log.Printf("Failed to remove participant from database: %v", err)
	}

	// If there are no participants left, end the call
	if remainingParticipants == 0 {
		// Mark the call as inactive
		callSession.IsActive = false

		// Remove the call from the active calls map
		m.activeCallsLock.Lock()
		delete(m.activeCalls, chatID)
		m.activeCallsLock.Unlock()

		// Mark the call as ended in the database
		err := endCallInDB(callID)
		if err != nil {
			log.Printf("Failed to end call in database: %v", err)
		}
	}

	// Close and remove all peer connections for this user
	m.peerConnectionsLock.Lock()
	if userConnections, exists := m.peerConnections[userID]; exists {
		for targetID, pc := range userConnections {
			if pc != nil {
				pc.Close()
			}
			delete(userConnections, targetID)
		}
		delete(m.peerConnections, userID)
	}
	m.peerConnectionsLock.Unlock()

	return callID, remainingParticipants, nil
}

// HandleOffer handles a WebRTC offer from a user
func (m *WebRTCManager) HandleOffer(fromUserID, targetUserID string, offerData interface{}) error {
	// Convert the offer data to JSON
	offerJSON, err := json.Marshal(offerData)
	if err != nil {
		return fmt.Errorf("failed to marshal offer data: %w", err)
	}

	// Create a new WebRTC session description
	var offer webrtc.SessionDescription
	if err := json.Unmarshal(offerJSON, &offer); err != nil {
		return fmt.Errorf("failed to unmarshal offer data: %w", err)
	}

	// Create a new peer connection
	peerConnection, err := webrtc.NewPeerConnection(m.config)
	if err != nil {
		return fmt.Errorf("failed to create peer connection: %w", err)
	}

	// Set the remote description
	if err := peerConnection.SetRemoteDescription(offer); err != nil {
		peerConnection.Close()
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	// Create an answer
	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		peerConnection.Close()
		return fmt.Errorf("failed to create answer: %w", err)
	}

	// Set the local description
	if err := peerConnection.SetLocalDescription(answer); err != nil {
		peerConnection.Close()
		return fmt.Errorf("failed to set local description: %w", err)
	}

	// Store the peer connection
	m.peerConnectionsLock.Lock()
	if _, exists := m.peerConnections[targetUserID]; !exists {
		m.peerConnections[targetUserID] = make(map[string]*webrtc.PeerConnection)
	}
	m.peerConnections[targetUserID][fromUserID] = peerConnection
	m.peerConnectionsLock.Unlock()

	// Send the answer to the user
	wsMsg := WebRTCMessage{
		Type:         "webrtc_answer",
		TargetUserID: fromUserID,
		FromUserID:   targetUserID,
		Answer:       answer,
	}

	// Find the client for the target user
	client := findClientByUserID(targetUserID)
	if client == nil {
		peerConnection.Close()
		return fmt.Errorf("target user %s not found", targetUserID)
	}

	// Send the answer to the client
	msgBytes, _ := json.Marshal(wsMsg)
	client.send <- msgBytes

	return nil
}

// HandleAnswer handles a WebRTC answer from a user
func (m *WebRTCManager) HandleAnswer(fromUserID, targetUserID string, answerData interface{}) error {
	// Convert the answer data to JSON
	answerJSON, err := json.Marshal(answerData)
	if err != nil {
		return fmt.Errorf("failed to marshal answer data: %w", err)
	}

	// Create a new WebRTC session description
	var answer webrtc.SessionDescription
	if err := json.Unmarshal(answerJSON, &answer); err != nil {
		return fmt.Errorf("failed to unmarshal answer data: %w", err)
	}

	// Get the peer connection
	m.peerConnectionsLock.RLock()
	peerConnection, exists := m.getPeerConnection(targetUserID, fromUserID)
	m.peerConnectionsLock.RUnlock()

	if !exists {
		return fmt.Errorf("peer connection not found for users %s and %s", targetUserID, fromUserID)
	}

	// Set the remote description
	if err := peerConnection.SetRemoteDescription(answer); err != nil {
		return fmt.Errorf("failed to set remote description: %w", err)
	}

	return nil
}

// HandleIceCandidate handles a WebRTC ICE candidate from a user
func (m *WebRTCManager) HandleIceCandidate(fromUserID, targetUserID string, candidateData interface{}) error {
	// Convert the candidate data to JSON
	candidateJSON, err := json.Marshal(candidateData)
	if err != nil {
		return fmt.Errorf("failed to marshal candidate data: %w", err)
	}

	// Create a new WebRTC ICE candidate
	var candidate webrtc.ICECandidateInit
	if err := json.Unmarshal(candidateJSON, &candidate); err != nil {
		return fmt.Errorf("failed to unmarshal candidate data: %w", err)
	}

	// Get the peer connection
	m.peerConnectionsLock.RLock()
	peerConnection, exists := m.getPeerConnection(targetUserID, fromUserID)
	m.peerConnectionsLock.RUnlock()

	if !exists {
		return fmt.Errorf("peer connection not found for users %s and %s", targetUserID, fromUserID)
	}

	// Add the ICE candidate
	if err := peerConnection.AddICECandidate(candidate); err != nil {
		return fmt.Errorf("failed to add ICE candidate: %w", err)
	}

	return nil
}

// GetActiveCall returns information about an active call in a chat
func (m *WebRTCManager) GetActiveCall(chatID string) (*CallSession, error) {
	m.activeCallsLock.RLock()
	defer m.activeCallsLock.RUnlock()

	callSession, exists := m.findCallByChat(chatID)
	if !exists {
		return nil, fmt.Errorf("no active call found in chat %s", chatID)
	}

	return callSession, nil
}

// Helper function to find a call by chat ID
func (m *WebRTCManager) findCallByChat(chatID string) (*CallSession, bool) {
	callSession, exists := m.activeCalls[chatID]
	return callSession, exists
}

// Helper function to get a peer connection
func (m *WebRTCManager) getPeerConnection(userID, targetID string) (*webrtc.PeerConnection, bool) {
	userConnections, exists := m.peerConnections[userID]
	if !exists {
		return nil, false
	}

	peerConnection, exists := userConnections[targetID]
	return peerConnection, exists
}


// Helper function to find a client by user ID
func findClientByUserID(userID string) *Client {
	wsHub.mutex.RLock()
	defer wsHub.mutex.RUnlock()

	for client := range wsHub.clients {
		if client.userID == userID {
			return client
		}
	}

	return nil
}

// Database functions

// createCallInDB creates a new call in the database
func createCallInDB(chatID, callType, chatType string) (int, time.Time, error) {
	var callID int
	var startTime time.Time

	err := db.QueryRow(`
		INSERT INTO calls (chat_id, start_time, is_active, call_type, chat_type)
		VALUES ($1, NOW(), TRUE, $2, $3)
		RETURNING id, start_time
	`, chatID, callType, chatType).Scan(&callID, &startTime)

	return callID, startTime, err
}

// addParticipantToDB adds a participant to a call in the database
func addParticipantToDB(callID int, userID string) error {
	_, err := db.Exec(`
		INSERT INTO call_participants (call_id, user_id, join_time, is_active)
		VALUES ($1, $2, NOW(), TRUE)
		ON CONFLICT (call_id, user_id) 
		DO UPDATE SET join_time = NOW(), is_active = TRUE
	`, callID, userID)

	return err
}

// removeParticipantFromDB removes a participant from a call in the database
func removeParticipantFromDB(callID int, userID string) error {
	_, err := db.Exec(`
		UPDATE call_participants
		SET is_active = FALSE, leave_time = NOW()
		WHERE call_id = $1 AND user_id = $2 AND is_active = TRUE
	`, callID, userID)

	return err
}

// endCallInDB marks a call as ended in the database
func endCallInDB(callID int) error {
	_, err := db.Exec(`
		UPDATE calls
		SET is_active = FALSE, end_time = NOW()
		WHERE id = $1
	`, callID)

	return err
}

// Global WebRTC manager
var webrtcManager *WebRTCManager

// InitWebRTCManager initializes the WebRTC manager
func InitWebRTCManager() {
	webrtcManager = NewWebRTCManager()
}
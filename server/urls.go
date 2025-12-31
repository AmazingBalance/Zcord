package main

import (
	"os"
	"strings"
)

func publicAPIBaseURL() string {
	base := os.Getenv("PUBLIC_API_URL")
	if base == "" {
		// Fallback for setups that only configure the frontend var.
		base = os.Getenv("NEXT_PUBLIC_API_URL")
	}
	if base == "" {
		base = "http://localhost:8000"
	}
	return strings.TrimRight(base, "/")
}

// publicAssetURL converts stored paths like:
// - "uploads/abc.png"
// - "/uploads/abc.png"
// - "abc.png" (treated as uploads)
// into an absolute public URL using PUBLIC_API_URL.
func publicAssetURL(storedPath string) string {
	if storedPath == "" {
		return ""
	}
	if strings.HasPrefix(storedPath, "http://") || strings.HasPrefix(storedPath, "https://") {
		return storedPath
	}

	base := publicAPIBaseURL()
	if strings.HasPrefix(storedPath, "uploads/") {
		return base + "/" + storedPath
	}
	if strings.HasPrefix(storedPath, "/") {
		return base + storedPath
	}
	return base + "/uploads/" + storedPath
}


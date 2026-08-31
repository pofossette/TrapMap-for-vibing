package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/pkg/api"
)

func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.HealthResponse{Status: "ok", Service: "go-accelerator", Version: "0.1.0"})
}

func Ready(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}

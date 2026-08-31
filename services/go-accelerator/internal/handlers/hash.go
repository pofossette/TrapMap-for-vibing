package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/hash"
	"trapmap-go-accelerator/pkg/api"
)

func CanonicalHash(w http.ResponseWriter, r *http.Request) {
	var req api.CanonicalHashRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	canonical, h, err := hash.CanonicalHashRaw(req.Payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.CanonicalHashResponse{Canonical: canonical, Hash: h})
}

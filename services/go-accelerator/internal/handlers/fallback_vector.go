package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/vector"
	"trapmap-go-accelerator/pkg/api"
)

func FallbackVector(w http.ResponseWriter, r *http.Request) {
	var req api.FallbackVectorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	dim := 384
	if req.Dim != nil {
		dim = *req.Dim
	}
	vec := vector.DeterministicFallbackVector(req.Text, dim)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.FallbackVectorResponse{Vector: vec, Dim: dim})
}

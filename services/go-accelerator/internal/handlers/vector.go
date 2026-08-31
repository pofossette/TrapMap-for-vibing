package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/vector"
	"trapmap-go-accelerator/pkg/api"
)

func Cosine(w http.ResponseWriter, r *http.Request) {
	var req api.VectorCosineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sim := vector.Cosine(req.A, req.B)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.VectorCosineResponse{Similarity: sim, NormA: vector.Norm(req.A), NormB: vector.Norm(req.B)})
}

func BatchCosine(w http.ResponseWriter, r *http.Request) {
	var req api.BatchCosineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	scores := vector.BatchCosine(req.Query, req.Vectors)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.BatchCosineResponse{Scores: scores})
}

package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/dedup"
	"trapmap-go-accelerator/pkg/api"
)

func DedupFingerprint(w http.ResponseWriter, r *http.Request) {
	var req api.DedupFingerprintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fp := dedup.Fingerprint(req.Parts)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.DedupFingerprintResponse{Fingerprint: fp})
}

func DedupSimilarity(w http.ResponseWriter, r *http.Request) {
	var req api.DedupSimilarityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sim := dedup.JaccardSimilarity(req.LeftTokens, req.RightTokens)
	// compute shared/union for observability
	leftSet := make(map[string]bool, len(req.LeftTokens))
	for _, t := range req.LeftTokens {
		leftSet[t] = true
	}
	rightSet := make(map[string]bool, len(req.RightTokens))
	for _, t := range req.RightTokens {
		rightSet[t] = true
	}
	shared := 0
	for k := range leftSet {
		if rightSet[k] {
			shared++
		}
	}
	union := len(leftSet) + len(rightSet) - shared
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.DedupSimilarityResponse{Similarity: sim, SharedCount: shared, UnionCount: union})
}

func DedupBatchSimilarity(w http.ResponseWriter, r *http.Request) {
	var req api.DedupBatchSimilarityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sims, shared, union := dedup.BatchSimilaritySharedUnion(req.LeftTokens, req.RightTokensList)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.DedupBatchSimilarityResponse{Similarities: sims, SharedCounts: shared, UnionCounts: union})
}


package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/gene"
	"trapmap-go-accelerator/pkg/api"
)

func GeneSelect(w http.ResponseWriter, r *http.Request) {
	var req api.GeneSelectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cands := make([]gene.Candidate, 0, len(req.Candidates))
	for _, c := range req.Candidates {
		cands = append(cands, gene.Candidate{
			GeneID: c.GeneID, SemanticScore: c.SemanticScore, KeywordScore: c.KeywordScore,
			ExactMatch: c.ExactMatch, ErrorTextMatch: c.ErrorTextMatch, BoundaryMatch: c.BoundaryMatch,
			FreshValidation: c.FreshValidation, BroadMatch: c.BroadMatch, SourceKind: c.SourceKind,
		})
	}
	max := 5
	if req.MaxResults != nil {
		max = *req.MaxResults
	}
	res := gene.Select(cands, max)
	out := make([]api.ScoredGene, len(res))
	for i, s := range res {
		out[i] = api.ScoredGene{GeneID: s.GeneID, Score: s.Score, Reasons: s.Reasons}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.GeneSelectResponse{Selected: out})
}

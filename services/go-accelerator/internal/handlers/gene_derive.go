package handlers

import (
	"encoding/json"
	"net/http"

	genederive "trapmap-go-accelerator/internal/service/gene-derive"
	"trapmap-go-accelerator/pkg/api"
)

func GeneDeriveBatch(w http.ResponseWriter, r *http.Request) {
	var req api.GeneDeriveBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Traps) == 0 {
		http.Error(w, "traps required", http.StatusBadRequest)
		return
	}
	if len(req.Traps) > 200 {
		http.Error(w, "too many traps", http.StatusBadRequest)
		return
	}
	inputs := make([]genederive.TrapInput, 0, len(req.Traps))
	for _, t := range req.Traps {
		inputs = append(inputs, genederive.TrapInput{TrapID: t.TrapID, TrapText: t.TrapText, DerivationUnitID: t.DerivationUnitID})
	}
	results := genederive.DeriveBatch(inputs)
	apiResults := make([]api.GeneDeriveResult, 0, len(results))
	for _, res := range results {
		apiResults = append(apiResults, api.GeneDeriveResult{
			TrapID: res.TrapID, DerivationUnitID: res.DerivationUnitID,
			Sections: api.GeneDeriveSections{
				MATCH: res.Sections.MATCH, GOAL: res.Sections.GOAL, STRATEGY: res.Sections.STRATEGY, AVOID: res.Sections.AVOID, VERIFY: res.Sections.VERIFY,
			},
			ContentHash: res.ContentHash, SourceHash: res.SourceHash,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.GeneDeriveBatchResponse{Results: apiResults})
}

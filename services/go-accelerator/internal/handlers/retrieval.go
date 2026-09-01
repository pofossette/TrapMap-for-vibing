// Deprecated: use knowledge-read-go/internal/recall — will be removed 2026-10-15
package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/retrieval"
	"trapmap-go-accelerator/pkg/api"
)

func RetrievalScore(w http.ResponseWriter, r *http.Request) {
	var req api.RetrievalScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	entries := make([]retrieval.Entry, 0, len(req.Entries))
	for _, e := range req.Entries {
		entries = append(entries, retrieval.Entry{
			ID: e.ID, Scope: e.Scope, Labels: e.Labels, RequiredLevel: e.RequiredLevel, Shortcut: e.Shortcut, Detail: e.Detail, Score: e.Score,
		})
	}
	filters := retrieval.Filters{Labels: req.Filters.Labels, Scopes: req.Filters.Scopes}
	scored := retrieval.ScoreEntries(entries, req.Query, filters)
	global, project := retrieval.AssembleBuckets(scored, filters)
	toAPI := func(es []retrieval.Entry) []api.RetrievalScoreEntry {
		out := make([]api.RetrievalScoreEntry, len(es))
		for i, e := range es {
			out[i] = api.RetrievalScoreEntry{ID: e.ID, Scope: e.Scope, Labels: e.Labels, RequiredLevel: e.RequiredLevel, Shortcut: e.Shortcut, Detail: e.Detail, Score: e.Score}
		}
		return out
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.RetrievalScoreResponse{
		GlobalConstraints: toAPI(global),
		ProjectKnowledge:  toAPI(project),
		Reason:            "go-accelerator scoring",
	})
}

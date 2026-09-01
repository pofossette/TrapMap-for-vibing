package api

import (
	"encoding/json"
	"net/http"

	assemblySvc "trapmap-knowledge-read-go/internal/assembly/service"
	querySvc "trapmap-knowledge-read-go/internal/query/service"
	rankingSvc "trapmap-knowledge-read-go/internal/ranking/service"
	recallSvc "trapmap-knowledge-read-go/internal/recall/service"
	"trapmap-knowledge-read-go/pkg/api"
)

type Handler struct {
	query    *querySvc.Service
	semantic *recallSvc.SemanticService
	keyword  *recallSvc.KeywordService
	graph    *recallSvc.GraphService
	ranking  *rankingSvc.Service
	assembly *assemblySvc.Service
}

func NewHandler(q *querySvc.Service, s *recallSvc.SemanticService, k *recallSvc.KeywordService, g *recallSvc.GraphService, r *rankingSvc.Service, a *assemblySvc.Service) *Handler {
	return &Handler{query: q, semantic: s, keyword: k, graph: g, ranking: r, assembly: a}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.HealthResponse{Status: "ok", Service: "knowledge-read-go", Version: "0.1.0"})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}

func (h *Handler) Read(w http.ResponseWriter, r *http.Request) {
	var req api.KnowledgeReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Query == "" {
		http.Error(w, "query required", http.StatusBadRequest)
		return
	}
	tokens, vec, err := h.query.Plan(r.Context(), req.Query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = tokens
	_ = vec
	// minimal recall → ranking → assembly pipeline (read-only, no DB required for health)
	resp := api.KnowledgeReadResponse{
		Entries:   []api.RankingEntry{},
		Summary:   "",
		Citations: []api.Citation{},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

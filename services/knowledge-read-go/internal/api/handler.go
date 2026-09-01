package api

import (
	"encoding/json"
	"net/http"

	assemblyDomain "trapmap-knowledge-read-go/internal/assembly/domain"
	rankingDomain "trapmap-knowledge-read-go/internal/ranking/domain"

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

type rankingDomainEntry = rankingDomain.Entry
type assemblyDomainEntry = assemblyDomain.Entry

func toDomainEntries(in []rankingDomainEntry) []rankingDomain.Entry {
	out := make([]rankingDomain.Entry, len(in))
	for i, e := range in {
		out[i] = rankingDomain.Entry{ID: e.ID, SemanticScore: e.SemanticScore, KeywordScore: e.KeywordScore, CombinedScore: e.CombinedScore, Channels: e.Channels, Labels: e.Labels, Scope: e.Scope}
	}
	return out
}

func toCitations(in []assemblyDomain.Citation) []api.Citation {
	out := make([]api.Citation, len(in))
	for i, c := range in {
		out[i] = api.Citation{ID: c.ID, Scope: c.Scope, Detail: c.Detail}
	}
	return out
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
	semEntries, _ := h.semantic.Recall(r.Context(), vec, req.Query)
	kwEntries, _ := h.keyword.Recall(r.Context(), tokens)
	limit := 10
	if req.Limit != nil {
		limit = *req.Limit
	}
	semMap := map[string]float64{}
	kwMap := map[string]float64{}
	ids := map[string]struct{}{}
	for _, e := range semEntries {
		semMap[e.Entry.ID] = e.Score
		ids[e.Entry.ID] = struct{}{}
	}
	for _, e := range kwEntries {
		kwMap[e.Entry.ID] = e.Score
		ids[e.Entry.ID] = struct{}{}
	}
	idList := make([]string, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	ranked := h.ranking.Merge(semMap, kwMap, idList)
	var apiEntries []api.RankingEntry
	for _, re := range ranked {
		if len(apiEntries) >= limit {
			break
		}
		ae := api.RankingEntry{
			ID: re.ID, SemanticScore: re.SemanticScore, KeywordScore: re.KeywordScore,
			CombinedScore: re.CombinedScore, Channels: re.Channels, Labels: re.Labels, Scope: re.Scope,
			ChannelScores: map[string]float64{}, TokenMatches: []api.TokenMatch{},
			PreRerankScore: re.CombinedScore, FinalScore: re.CombinedScore,
		}
		apiEntries = append(apiEntries, ae)
	}
	domainEntries := make([]rankingDomainEntry, 0, len(apiEntries))
	for _, ae := range apiEntries {
		domainEntries = append(domainEntries, rankingDomainEntry{ID: ae.ID, SemanticScore: ae.SemanticScore, KeywordScore: ae.KeywordScore, CombinedScore: ae.CombinedScore, Channels: ae.Channels, Labels: ae.Labels, Scope: ae.Scope})
	}
	ranked2 := h.ranking.Rank(r.Context(), toDomainEntries(domainEntries), tokens, nil)
	apiEntries = nil
	for _, re := range ranked2 {
		if len(apiEntries) >= limit {
			break
		}
		ae := api.RankingEntry{ID: re.ID, SemanticScore: re.SemanticScore, KeywordScore: re.KeywordScore, CombinedScore: re.CombinedScore, Channels: re.Channels, Labels: re.Labels, Scope: re.Scope, ChannelScores: map[string]float64{}, TokenMatches: []api.TokenMatch{}, PreRerankScore: re.CombinedScore, FinalScore: re.CombinedScore}
		apiEntries = append(apiEntries, ae)
	}
	asmEntries := make([]assemblyDomainEntry, 0, len(apiEntries))
	for _, ae := range apiEntries {
		asmEntries = append(asmEntries, assemblyDomainEntry{ID: ae.ID, Scope: ae.Scope, Detail: ae.Detail})
	}
	asmResp, _ := h.assembly.Assemble(r.Context(), asmEntries)
	resp := api.KnowledgeReadResponse{
		Entries:   apiEntries,
		Summary:   asmResp.Summary,
		Citations: toCitations(asmResp.Citations),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

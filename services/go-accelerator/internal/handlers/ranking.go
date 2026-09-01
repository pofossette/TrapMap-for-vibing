// Deprecated: use knowledge-read-go/internal/ranking — will be removed 2026-10-15, see DEPRECATED.md
package handlers

import (
	"log"

	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/ranking"
	"trapmap-go-accelerator/pkg/api"
)

func RankingBatch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Deprecated", "use knowledge-read-go")
	log.Printf("WARN deprecated RankingBatch called, use knowledge-read-go")
	var req api.RankingBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Convert API entries to ranking entries
	toRank := func(es []api.RankingEntry) []ranking.Entry {
		out := make([]ranking.Entry, 0, len(es))
		for _, e := range es {
			bo := e.Boundary
			var b *ranking.Boundary
			if bo != nil {
				b = &ranking.Boundary{
					Context: bo.Context,
				}
				for _, ex := range bo.Exclusions {
					b.Exclusions = append(b.Exclusions, ranking.Exclusion{Kind: ex.Kind, Description: ex.Description})
				}
			}
			var ds *string
			if e.DecayState != nil {
				ds = e.DecayState
			}
			te := ranking.Entry{
				ID: e.ID, SemanticScore: e.SemanticScore, KeywordScore: e.KeywordScore,
				ChannelScores: e.ChannelScores, CombinedScore: e.CombinedScore,
				Channels: e.Channels, PreRerankScore: e.PreRerankScore, FinalScore: e.FinalScore,
				Labels: e.Labels, Scope: e.Scope, Shortcut: e.Shortcut, Detail: e.Detail,
				DecayState: ds, Boundary: b,
			}
			if e.GraphScore != nil {
				te.GraphScore = e.GraphScore
			}
			for _, tm := range e.TokenMatches {
				te.TokenMatches = append(te.TokenMatches, ranking.TokenMatch{Token: tm.Token, Fields: tm.Fields})
			}
			out = append(out, te)
		}
		return out
	}

	// For this batch we support two modes: if GraphEntries provided, do mergeWithGraph; else merge+rerank
	// To keep API simple, we treat req.Entries as semantic+keyword merged already if ChannelScores present
	// But we also support separate SemanticEntries/KeywordEntries if provided via Channels
	// For now: assume Entries are pre-merged (CombinedScore already weighted), we just rerank
	candidates := toRank(req.Entries)
	// If SemanticEntries/KeywordEntries provided, merge them
	if len(req.SemanticEntries) > 0 || len(req.KeywordEntries) > 0 {
		sem := toRank(req.SemanticEntries)
		kw := toRank(req.KeywordEntries)
		candidates = ranking.MergeCandidates(sem, kw)
	}
	// rerank
	maxCandidates := 10
	if req.MaxCandidates != nil {
		maxCandidates = *req.MaxCandidates
	}
	var ctx *ranking.BoundaryContext
	if req.BoundaryContext != nil {
		ctx = &ranking.BoundaryContext{Contexts: req.BoundaryContext.Contexts, Platform: req.BoundaryContext.Platform}
	}
	candidates = ranking.RerankCandidates(candidates, req.QueryTokens, maxCandidates, ctx)
	// merge with graph if any
	if len(req.GraphEntries) > 0 {
		graph := toRank(req.GraphEntries)
		candidates = ranking.MergeCandidatesWithGraph(candidates, graph)
	}

	// convert back
	toAPI := func(es []ranking.Entry) []api.RankingEntry {
		out := make([]api.RankingEntry, 0, len(es))
		for _, e := range es {
			ae := api.RankingEntry{
				ID: e.ID, SemanticScore: e.SemanticScore, KeywordScore: e.KeywordScore, GraphScore: e.GraphScore,
				ChannelScores: e.ChannelScores, CombinedScore: e.CombinedScore,
				Channels: e.Channels, PreRerankScore: e.PreRerankScore, FinalScore: e.FinalScore,
				Labels: e.Labels, Scope: e.Scope, Shortcut: e.Shortcut, Detail: e.Detail,
			}
			if e.BoundaryScoreDelta != nil {
				ae.BoundaryScoreDelta = e.BoundaryScoreDelta
			}
			if e.DecayState != nil {
				ae.DecayState = e.DecayState
			}
			for _, tm := range e.TokenMatches {
				ae.TokenMatches = append(ae.TokenMatches, api.TokenMatch{Token: tm.Token, Fields: tm.Fields})
			}
			out = append(out, ae)
		}
		return out
	}

	resp := api.RankingBatchResponse{Merged: toAPI(candidates)}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func KeywordScore(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Deprecated", "use knowledge-read-go")
	log.Printf("WARN deprecated KeywordScore called")
	var req api.KeywordScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// weights 3/2/1 matches tokenization.ts
	const labelW = 3.0
	const shortcutW = 2.0
	const detailW = 1.0
	maxFieldScore := labelW + shortcutW + detailW
	totalWeighted := 0.0
	maxPossible := 0.0
	matches := []api.TokenMatch{}
	if len(req.QueryTokens) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(api.KeywordScoreResponse{Score: 0, TokenMatches: []api.TokenMatch{}})
		return
	}
	labelSet := make(map[string]bool, len(req.EntryTokens.Labels))
	for _, t := range req.EntryTokens.Labels {
		labelSet[t] = true
	}
	shortcutSet := make(map[string]bool, len(req.EntryTokens.Shortcut))
	for _, t := range req.EntryTokens.Shortcut {
		shortcutSet[t] = true
	}
	detailSet := make(map[string]bool, len(req.EntryTokens.Detail))
	for _, t := range req.EntryTokens.Detail {
		detailSet[t] = true
	}
	for _, token := range req.QueryTokens {
		score := 0.0
		fields := []string{}
		if labelSet[token] {
			score += labelW
			fields = append(fields, "labels")
		}
		if shortcutSet[token] {
			score += shortcutW
			fields = append(fields, "shortcut")
		}
		if detailSet[token] {
			score += detailW
			fields = append(fields, "detail")
		}
		if len(fields) > 0 {
			matches = append(matches, api.TokenMatch{Token: token, Fields: fields})
		}
		totalWeighted += score
		maxPossible += maxFieldScore
	}
	score := 0.0
	if maxPossible > 0 {
		score = totalWeighted / maxPossible
		if score > 1 {
			score = 1
		}
		if score < 0 {
			score = 0
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.KeywordScoreResponse{Score: score, TokenMatches: matches})
}

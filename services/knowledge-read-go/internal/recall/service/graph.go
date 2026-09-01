package service

import (
	"context"
	"trapmap-knowledge-read-go/internal/recall/store"
)

type GraphService struct {
	store *store.PG
}

func NewGraph(s *store.PG) *GraphService { return &GraphService{store: s} }

func (s *GraphService) Recall(ctx context.Context, query string) ([]ScoredEntry, error) {
	entries, err := s.store.Read(ctx, 50)
	if err != nil {
		return nil, err
	}
	var out []ScoredEntry
	for _, e := range entries {
		// placeholder graph score: semantic overlap proxy
		if e.Scope == "global" {
			out = append(out, ScoredEntry{Entry: e, Score: 0.2, Channel: "graph"})
		}
	}
	return out, nil
}

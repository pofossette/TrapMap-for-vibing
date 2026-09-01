package service

import (
	"context"
	"strings"

	"trapmap-knowledge-read-go/internal/recall/domain"
	"trapmap-knowledge-read-go/internal/recall/store"
)

type KeywordService struct {
	store *store.PG
}

func NewKeyword(s *store.PG) *KeywordService { return &KeywordService{store: s} }

func (s *KeywordService) Recall(ctx context.Context, tokens []string) ([]ScoredEntry, error) {
	entries, err := s.store.Read(ctx, 100)
	if err != nil {
		return nil, err
	}
	var out []ScoredEntry
	for _, e := range entries {
		labels := make(map[string]struct{}, len(e.Labels))
		for _, l := range e.Labels {
			for _, t := range strings.Fields(strings.ToLower(l)) {
				labels[t] = struct{}{}
			}
		}
		shortcut := domain.TokenizeSet(e.Shortcut)
		detail := domain.TokenizeSet(e.Detail)
		score, _ := domain.KeywordScore(tokens, labels, shortcut, detail)
		if score > 0 {
			out = append(out, ScoredEntry{Entry: e, Score: score, Channel: "keyword"})
		}
	}
	return out, nil
}

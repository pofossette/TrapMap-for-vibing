package service

import (
	"context"

	"trapmap-knowledge-read-go/internal/ranking/domain"
)

type Service struct{}

func New() *Service { return &Service{} }

func (s *Service) Rank(ctx context.Context, entries []domain.Entry, queryTokens []string, boundary *domain.Boundary) []domain.Entry {
	for i := range entries {
		if boundary != nil {
			entries[i].CombinedScore += domain.BoundaryDelta(boundary, "")
		}
	}
	return domain.Rerank(entries, queryTokens)
}

func (s *Service) Merge(semantic, keyword map[string]float64, ids []string) []domain.Entry {
	return domain.Merge(semantic, keyword, ids)
}

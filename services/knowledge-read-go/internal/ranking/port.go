package ranking

import (
	"context"
	"trapmap-knowledge-read-go/internal/ranking/domain"
)

type Port interface {
	Rank(ctx context.Context, entries []domain.Entry, queryTokens []string, boundary *domain.Boundary) []domain.Entry
	Merge(semantic, keyword map[string]float64, ids []string) []domain.Entry
}

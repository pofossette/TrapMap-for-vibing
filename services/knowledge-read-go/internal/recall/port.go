package recall

import "context"

type Port interface {
	RecallSemantic(ctx context.Context, qVec []float64, query string) ([]ScoredEntry, error)
	RecallKeyword(ctx context.Context, tokens []string) ([]ScoredEntry, error)
	RecallGraph(ctx context.Context, query string) ([]ScoredEntry, error)
}

type ScoredEntry struct {
	Entry   interface{}
	Score   float64
	Channel string
}

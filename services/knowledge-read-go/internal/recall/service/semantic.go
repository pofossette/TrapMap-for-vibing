package service

import (
	"context"

	"trapmap-knowledge-read-go/internal/cache"
	"trapmap-knowledge-read-go/internal/recall/domain"
	"trapmap-knowledge-read-go/internal/recall/store"
)

type SemanticService struct {
	store *store.PG
	cache *cache.Cache
}

func NewSemantic(s *store.PG, c *cache.Cache) *SemanticService {
	return &SemanticService{store: s, cache: c}
}

func (s *SemanticService) Recall(ctx context.Context, qVec []float64, query string) ([]ScoredEntry, error) {
	entries, err := s.store.Read(ctx, 100)
	if err != nil {
		return nil, err
	}
	var out []ScoredEntry
	for _, e := range entries {
		key := "vec:" + e.ID
		var vec []float64
		if v, ok := s.cache.Get(key); ok {
			vec = v
		} else {
			// deterministic fallback as placeholder for real embedding load
			vec = domainPlaceholderVec(e.Shortcut + " " + e.Detail)
			s.cache.Set(key, vec)
		}
		score := domain.Cosine(qVec, vec)
		out = append(out, ScoredEntry{Entry: e, Score: score, Channel: "semantic"})
	}
	return out, nil
}

func domainPlaceholderVec(text string) []float64 {
	// reuse same fn as query embedding for consistency, dim 32 for test speed
	h := uint64(1469598103934665603)
	for _, c := range text {
		h ^= uint64(c)
		h *= 1099511628211
	}
	vec := make([]float64, 32)
	for i := range vec {
		h ^= uint64(i) * 0x9e3779b97f4a7c15
		h *= 1099511628211
		vec[i] = float64(int64(h%10000)-5000) / 5000.0
	}
	return vec
}

type ScoredEntry struct {
	Entry   store.Entry
	Score   float64
	Channel string
}

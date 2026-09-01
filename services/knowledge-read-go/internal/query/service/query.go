package service

import (
	"context"

	"trapmap-knowledge-read-go/internal/cache"
	"trapmap-knowledge-read-go/internal/query/domain"
)

type Service struct {
	cache *cache.Cache
}

func New(c *cache.Cache) *Service { return &Service{cache: c} }

func (s *Service) Plan(ctx context.Context, q string) ([]string, []float64, error) {
	tokens := domain.NormalizeQuery(q)
	key := "emb:" + q
	if s.cache != nil {
		if v, ok := s.cache.Get(key); ok {
			return tokens, v, nil
		}
	}
	vec, err := s.loadVector(ctx, q)
	if err != nil {
		return tokens, nil, err
	}
	if s.cache != nil {
		s.cache.Set(key, vec)
	}
	return tokens, vec, nil
}

func (s *Service) loadVector(ctx context.Context, q string) ([]float64, error) {
	if s.cache != nil {
		v, err, _ := s.cache.SF.Do(q, func() (interface{}, error) {
			return domain.DeterministicFallback(q, 384), nil
		})
		if err != nil {
			return nil, err
		}
		return v.([]float64), nil
	}
	return domain.DeterministicFallback(q, 384), nil
}

func (s *Service) Tokenize(text string) []string { return domain.Tokenize(text) }

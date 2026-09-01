package service

import (
	"context"

	"trapmap-knowledge-read-go/internal/assembly/domain"
)

type Service struct{}

func New() *Service { return &Service{} }

type Response struct {
	Entries   []domain.Entry  `json:"entries"`
	Summary   string          `json:"summary"`
	Citations []domain.Citation `json:"citations"`
}

func (s *Service) Assemble(ctx context.Context, entries []domain.Entry) (Response, error) {
	citations := domain.Build(entries)
	summary := domain.Summarize(entries, 3)
	return Response{Entries: entries, Citations: citations, Summary: summary}, nil
}

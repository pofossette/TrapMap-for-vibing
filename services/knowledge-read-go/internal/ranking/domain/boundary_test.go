package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"trapmap-knowledge-read-go/internal/ranking/domain"
)

func TestBoundaryDelta_ContextMatch(t *testing.T) {
	b := &domain.Boundary{Context: []string{"prod"}, Exclusions: []domain.Exclusion{{Kind: "context", Description: "prod is excluded"}}}
	// context match gives +0.1 but exclusion gives -0.15 => net -0.05
	delta := domain.BoundaryDelta(b, "prod")
	require.InDelta(t, -0.05, delta, 0.001)
}

func TestBoundaryDelta_NoBoundary(t *testing.T) {
	require.Equal(t, 0.0, domain.BoundaryDelta(nil, "prod"))
}

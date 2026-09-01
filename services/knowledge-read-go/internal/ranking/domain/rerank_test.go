package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"trapmap-knowledge-read-go/internal/ranking/domain"
)

func TestRerank_DualBoost(t *testing.T) {
	cands := []domain.Entry{
		{ID: "a", SemanticScore: 0.7, KeywordScore: 0.7, CombinedScore: 0.7, Channels: []string{"semantic", "keyword"}},
		{ID: "b", SemanticScore: 0.6, CombinedScore: 0.6, Channels: []string{"semantic"}},
	}
	out := domain.Rerank(cands, []string{"x", "y"})
	require.Len(t, out, 2)
	require.Equal(t, "a", out[0].ID)
	require.Greater(t, out[0].CombinedScore, 0.7) // DualChannelRerankBoost 0.15
}

func TestRerank_ScopeStalePenalty(t *testing.T) {
	cands := []domain.Entry{{ID: "a", CombinedScore: 0.8, Scope: "stale"}}
	out := domain.Rerank(cands, nil)
	require.Less(t, out[0].CombinedScore, 0.8)
}

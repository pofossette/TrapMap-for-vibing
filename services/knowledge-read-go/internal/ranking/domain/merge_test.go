package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"trapmap-knowledge-read-go/internal/ranking/domain"
)

func TestMerge_Weights(t *testing.T) {
	sem := map[string]float64{"a": 0.8, "b": 0.5}
	kw := map[string]float64{"a": 0.6}
	merged := domain.Merge(sem, kw, []string{"a", "b"})
	require.Len(t, merged, 2)
	var a domain.Entry
	for _, e := range merged {
		if e.ID == "a" {
			a = e
		}
	}
	// 0.8*0.6 + 0.6*0.4 = 0.72
	require.InDelta(t, 0.72, a.CombinedScore, 0.001)
	require.Contains(t, a.Channels, "semantic")
	require.Contains(t, a.Channels, "keyword")
}

func TestMerge_OnlyKeyword(t *testing.T) {
	sem := map[string]float64{}
	kw := map[string]float64{"x": 0.9}
	merged := domain.Merge(sem, kw, []string{"x"})
	require.InDelta(t, 0.36, merged[0].CombinedScore, 0.001)
}

package cache_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"trapmap-knowledge-read-go/internal/cache"
)

func TestCache_LRU_Evict(t *testing.T) {
	c := cache.New(2)
	c.Set("a", []float64{1})
	c.Set("b", []float64{2})
	c.Set("c", []float64{3})
	_, ok := c.Get("a")
	require.False(t, ok)
	_, ok = c.Get("b")
	require.True(t, ok)
}

func TestCache_GetOrLoad(t *testing.T) {
	c := cache.New(10)
	calls := 0
	v, err := c.GetOrLoad("k", func() ([]float64, error) { calls++; return []float64{1, 2}, nil })
	require.NoError(t, err)
	require.Equal(t, []float64{1, 2}, v)
	require.Equal(t, 1, calls)
	v2, _ := c.GetOrLoad("k", func() ([]float64, error) { calls++; return []float64{9}, nil })
	require.Equal(t, []float64{1, 2}, v2)
	require.Equal(t, 1, calls)
}

package cache

import "testing"

func TestLRU(t *testing.T) {
	c := New(2)
	c.Set("a", []float64{1, 2})
	c.Set("b", []float64{3, 4})
	if v, ok := c.Get("a"); !ok || v[0] != 1 {
		t.Fatalf("get a")
	}
	c.Set("c", []float64{5, 6}) // evicts b (LRU)
	if _, ok := c.Get("b"); ok {
		t.Fatalf("b should evicted")
	}
	if c.Len() != 2 {
		t.Fatalf("len")
	}
}

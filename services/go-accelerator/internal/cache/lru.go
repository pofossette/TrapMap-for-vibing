package cache

import (
	"container/list"
	"sync"
)

// LRU 10k + singleflight style (simple mutex) for embedding query cache
// Distributed-only, env TRAPMAP_GO_ACCEL_CACHE_SIZE (default 10000)
// Not used for DB vectors, only for repeated queryVector embedding texts

type LRU struct {
	mu       sync.Mutex
	cap      int
	ll       *list.List
	cache    map[string]*list.Element
}

type entry struct {
	key   string
	value []float64
}

func New(cap int) *LRU {
	if cap <= 0 {
		cap = 10000
	}
	return &LRU{cap: cap, ll: list.New(), cache: make(map[string]*list.Element)}
}

func (c *LRU) Get(key string) ([]float64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ele, ok := c.cache[key]; ok {
		c.ll.MoveToFront(ele)
		// copy to avoid alias
		val := ele.Value.(*entry).value
		cp := make([]float64, len(val))
		copy(cp, val)
		return cp, true
	}
	return nil, false
}

func (c *LRU) Set(key string, value []float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ele, ok := c.cache[key]; ok {
		c.ll.MoveToFront(ele)
		ele.Value.(*entry).value = append([]float64(nil), value...)
		return
	}
	ent := &entry{key: key, value: append([]float64(nil), value...)}
	ele := c.ll.PushFront(ent)
	c.cache[key] = ele
	if c.ll.Len() > c.cap {
		tail := c.ll.Back()
		if tail != nil {
			c.ll.Remove(tail)
			delete(c.cache, tail.Value.(*entry).key)
		}
	}
}

func (c *LRU) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ll.Len()
}

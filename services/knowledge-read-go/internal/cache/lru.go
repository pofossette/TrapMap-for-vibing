package cache

import (
	lru "github.com/hashicorp/golang-lru/v2"
	"golang.org/x/sync/singleflight"
)

type Cache struct {
	lru *lru.Cache[string, []float64]
	SF  singleflight.Group
}

func New(size int) *Cache {
	if size <= 0 {
		size = 10000
	}
	c, _ := lru.New[string, []float64](size)
	return &Cache{lru: c}
}

func (c *Cache) Get(key string) ([]float64, bool) {
	if c.lru == nil {
		return nil, false
	}
	v, ok := c.lru.Get(key)
	if !ok {
		return nil, false
	}
	cp := make([]float64, len(v))
	copy(cp, v)
	return cp, true
}

func (c *Cache) Set(key string, val []float64) {
	if c.lru == nil {
		return
	}
	cp := make([]float64, len(val))
	copy(cp, val)
	c.lru.Add(key, cp)
}

func (c *Cache) Len() int {
	if c.lru == nil {
		return 0
	}
	return c.lru.Len()
}

func (c *Cache) GetOrLoad(key string, load func() ([]float64, error)) ([]float64, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	v, err, _ := c.SF.Do(key, func() (interface{}, error) { return load() })
	if err != nil {
		return nil, err
	}
	arr := v.([]float64)
	c.Set(key, arr)
	return arr, nil
}

package vector

import (
	"math"
	"sync"
)

func Dot(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var s float64
	for i := 0; i < n; i++ {
		s += a[i] * b[i]
	}
	return s
}

func Norm(v []float64) float64 {
	var s float64
	for _, x := range v {
		s += x * x
	}
	return math.Sqrt(s)
}

func Normalize(v []float64) []float64 {
	n := Norm(v)
	if n == 0 {
		return append([]float64(nil), v...)
	}
	out := make([]float64, len(v))
	for i, x := range v {
		out[i] = x / n
	}
	return out
}

func Cosine(a, b []float64) float64 {
	na := Norm(a)
	nb := Norm(b)
	if na == 0 || nb == 0 {
		return 0
	}
	return Dot(a, b) / (na * nb)
}

func BatchCosine(query []float64, vectors [][]float64) []float64 {
	scores := make([]float64, len(vectors))
	var wg sync.WaitGroup
	// Parallelize over shards to reduce goroutine overhead for large batches (mature pattern)
	const shardSize = 64
	for start := 0; start < len(vectors); start += shardSize {
		end := start + shardSize
		if end > len(vectors) {
			end = len(vectors)
		}
		wg.Add(1)
		go func(s, e int) {
			defer wg.Done()
			for i := s; i < e; i++ {
				scores[i] = Cosine(query, vectors[i])
			}
		}(start, end)
	}
	wg.Wait()
	return scores
}

func DeterministicFallbackVector(seed string, dim int) []float64 {
	if dim <= 0 {
		dim = 8
	}
	vec := make([]float64, dim)
	var h uint64 = 1469598103934665603
	for _, c := range seed {
		h ^= uint64(c)
		h *= 1099511628211
	}
	for i := 0; i < dim; i++ {
		h ^= uint64(i) * 0x9e3779b97f4a7c15
		h *= 1099511628211
		vec[i] = float64(int64(h%10000)-5000) / 5000.0
	}
	return Normalize(vec)
}

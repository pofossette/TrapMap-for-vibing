package domain

import "math"

func DeterministicFallback(text string, dim int) []float64 {
	if dim <= 0 {
		dim = 384
	}
	vec := make([]float64, dim)
	var h uint64 = 1469598103934665603
	for _, c := range text {
		h ^= uint64(c)
		h *= 1099511628211
	}
	for i := 0; i < dim; i++ {
		h ^= uint64(i) * 0x9e3779b97f4a7c15
		h *= 1099511628211
		vec[i] = float64(int64(h%10000)-5000) / 5000.0
	}
	n := 0.0
	for _, v := range vec {
		n += v * v
	}
	n = math.Sqrt(n)
	if n == 0 {
		return vec
	}
	for i := range vec {
		vec[i] /= n
	}
	return vec
}

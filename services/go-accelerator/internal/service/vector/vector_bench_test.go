package vector

import "testing"

func BenchmarkCosine(b *testing.B) {
	a := make([]float64, 384)
	c := make([]float64, 384)
	for i := range a { a[i] = float64(i%10)/10; c[i] = float64((i+3)%10)/10 }
	b.ResetTimer()
	for i := 0; i < b.N; i++ { Cosine(a, c) }
}

func BenchmarkBatchCosine(b *testing.B) {
	q := make([]float64, 384)
	vecs := make([][]float64, 1000)
	for i := range vecs { vecs[i] = make([]float64, 384); for j := range vecs[i] { vecs[i][j] = float64((i+j)%10)/10 } }
	b.ResetTimer()
	for i := 0; i < b.N; i++ { BatchCosine(q, vecs) }
}

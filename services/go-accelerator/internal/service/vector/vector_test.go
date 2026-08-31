package vector

import (
	"math"
	"testing"
)

func TestCosine(t *testing.T) {
	a := []float64{1, 0, 0}
	b := []float64{1, 0, 0}
	if math.Abs(Cosine(a, b)-1) > 1e-9 {
		t.Fatalf("expected 1")
	}
	c := []float64{0, 1, 0}
	if math.Abs(Cosine(a, c)) > 1e-9 {
		t.Fatalf("expected 0")
	}
}

func TestBatchCosine(t *testing.T) {
	q := []float64{1, 0}
	vecs := [][]float64{{1, 0}, {0, 1}, {1, 1}}
	scores := BatchCosine(q, vecs)
	if len(scores) != 3 {
		t.Fatalf("len mismatch")
	}
	if scores[0] <= scores[1] {
		t.Fatalf("score ordering wrong")
	}
}

func TestNormalize(t *testing.T) {
	v := []float64{3, 4}
	n := Normalize(v)
	if math.Abs(Norm(n)-1) > 1e-9 {
		t.Fatalf("norm not 1")
	}
}

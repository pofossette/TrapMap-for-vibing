package dedup

import "testing"

func TestFingerprint(t *testing.T) {
	fp := Fingerprint([]string{"hello", "world"})
	if len(fp) != 64 {
		t.Fatalf("expected 64 hex, got %s", fp)
	}
	fp2 := Fingerprint([]string{"hello", "world"})
	if fp != fp2 {
		t.Fatalf("not deterministic")
	}
}

func TestJaccard(t *testing.T) {
	if s := JaccardSimilarity([]string{"a", "b"}, []string{"a", "b"}); s != 1 {
		t.Fatalf("expected 1 got %v", s)
	}
	if s := JaccardSimilarity([]string{"a"}, []string{"b"}); s != 0 {
		t.Fatalf("expected 0")
	}
	if s := JaccardSimilarity([]string{"Hello"}, []string{"hello"}); s != 1 {
		t.Fatalf("case")
	}
}

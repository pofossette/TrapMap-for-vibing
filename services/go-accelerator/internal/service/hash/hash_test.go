package hash

import "testing"

func TestCanonicalHash(t *testing.T) {
	payload := map[string]interface{}{"b": 2, "a": 1}
	canon, h, err := CanonicalHash(payload)
	if err != nil {
		t.Fatalf("err %v", err)
	}
	if canon != `{"a":1,"b":2}` {
		t.Fatalf("canonical mismatch got %s", canon)
	}
	if len(h) != 64 {
		t.Fatalf("hash len %d", len(h))
	}
	c2, h2, _ := CanonicalHash(payload)
	if c2 != canon || h2 != h {
		t.Fatalf("not deterministic")
	}
}

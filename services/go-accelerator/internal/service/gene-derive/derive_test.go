package genederive

import "testing"

func TestDeriveBatch(t *testing.T) {
	inputs := []TrapInput{
		{TrapID: "t1", TrapText: "MATCH: foo\nGOAL: bar\nSTRATEGY: fix it\nAVOID: bad\nVERIFY: test", DerivationUnitID: "u1"},
		{TrapID: "t2", TrapText: "MATCH: hello\nGOAL: world", DerivationUnitID: "u2"},
	}
	results := DeriveBatch(inputs)
	if len(results) != 2 {
		t.Fatalf("expected 2 got %d", len(results))
	}
	if len(results[0].Sections.MATCH) == 0 || len(results[0].Sections.GOAL) == 0 {
		t.Fatalf("expected sections parsed: %+v", results[0].Sections)
	}
	if len(results[0].ContentHash) != 64 || len(results[0].SourceHash) != 64 {
		t.Fatalf("expected hex hashes")
	}
	// deterministic
	r2 := DeriveBatch(inputs)
	if r2[0].ContentHash != results[0].ContentHash {
		t.Fatalf("not deterministic")
	}
	// parallel shard test 100
	many := make([]TrapInput, 100)
	for i := range many {
		many[i] = TrapInput{TrapID: "t", TrapText: "MATCH: x", DerivationUnitID: "u"}
	}
	mr := DeriveBatch(many)
	if len(mr) != 100 {
		t.Fatalf("100")
	}
}

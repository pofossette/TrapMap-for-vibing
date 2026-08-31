package gene

import "testing"

func TestGeneScoring(t *testing.T) {
	c := Candidate{GeneID: "g1", SemanticScore: 0.8, KeywordScore: 0.7, ExactMatch: true, SourceKind: "trap"}
	score, reasons := Score(c)
	expected := 0.8*SemanticWeight + 0.7*KeywordWeight + ExactBoost + 0.03
	if score != expected {
		t.Fatalf("score %v expected %v", score, expected)
	}
	if len(reasons) == 0 {
		t.Fatalf("no reasons")
	}
}

func TestGeneSelect(t *testing.T) {
	cands := []Candidate{
		{GeneID: "g1", SemanticScore: 0.9, KeywordScore: 0.9},
		{GeneID: "g2", SemanticScore: 0.1, KeywordScore: 0.1},
		{GeneID: "g3", SemanticScore: 0.5, KeywordScore: 0.5, BroadMatch: true},
	}
	res := Select(cands, 2)
	if len(res) != 2 {
		t.Fatalf("len")
	}
	if res[0].GeneID != "g1" {
		t.Fatalf("ordering wrong")
	}
}

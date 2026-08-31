package ranking

import "testing"

func TestMergeCandidates(t *testing.T) {
	sem := []Entry{{ID: "a", SemanticScore: 0.8}, {ID: "b", SemanticScore: 0.5}}
	kw := []Entry{{ID: "a", KeywordScore: 0.6, SemanticScore: 0.6, TokenMatches: []TokenMatch{{Token: "x", Fields: []string{"labels"}}}}}
	merged := MergeCandidates(sem, kw)
	if len(merged) != 2 {
		t.Fatalf("expected 2, got %d", len(merged))
	}
	// a should have combined 0.8*0.6 + 0.6*0.4 = 0.72
	var a Entry
	for _, e := range merged {
		if e.ID == "a" {
			a = e
		}
	}
	if diff := a.CombinedScore - 0.72; diff > 1e-9 || diff < -1e-9 {
		t.Fatalf("expected 0.72 got %v", a.CombinedScore)
	}
}

func TestRerankCandidates(t *testing.T) {
	cands := []Entry{
		{ID: "a", CombinedScore: 0.7, SemanticScore: 0.7, Channels: []string{"semantic", "keyword"}, TokenMatches: []TokenMatch{{Token: "x", Fields: []string{"labels"}}}},
		{ID: "b", CombinedScore: 0.6, SemanticScore: 0.6, Channels: []string{"semantic"}},
	}
	reranked := RerankCandidates(cands, []string{"x", "y"}, 10, nil)
	if len(reranked) != 2 {
		t.Fatalf("len")
	}
	// a gets dual channel boost 0.08 + coverage 0.05 if 1/2=0.5 exactly threshold
	if reranked[0].ID != "a" {
		t.Fatalf("expected a first")
	}
	if reranked[0].FinalScore <= 0.7 {
		t.Fatalf("expected boosted")
	}
}

func TestComputeScore(t *testing.T) {
	s := ComputeScore(0.5, []string{"a"}, "global", []string{"a"}, []string{"global"}, "hello", []string{"a"}, "global", "hello", "world")
	if s <= 0.5 {
		t.Fatalf("expected boost")
	}
}

func TestMergeWithGraph(t *testing.T) {
	hybrid := []Entry{{ID: "a", CombinedScore: 0.6, FinalScore: 0.6, Channels: []string{"semantic"}}}
	graph := []Entry{{ID: "a", SemanticScore: 0.5}, {ID: "b", SemanticScore: 0.4}}
	merged := MergeCandidatesWithGraph(hybrid, graph)
	if len(merged) != 2 {
		t.Fatalf("expected 2")
	}
}

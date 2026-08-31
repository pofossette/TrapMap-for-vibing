package gene

import "sort"

const (
	SemanticWeight = 0.6
	KeywordWeight  = 0.4
	ExactBoost     = 0.1
	ErrorTextBoost = 0.05
	BoundaryBoost  = 0.05
	FreshBoost     = 0.04
	BroadPenalty   = 0.1
)

var authorityBoost = map[string]float64{
	"trap":           0.03,
	"skill-artifact": 0.02,
	"skill-capsule":  0.01,
}

type Candidate struct {
	GeneID          string
	SemanticScore   float64
	KeywordScore    float64
	ExactMatch      bool
	ErrorTextMatch  bool
	BoundaryMatch   bool
	FreshValidation bool
	BroadMatch      bool
	SourceKind      string
}

type Scored struct {
	GeneID  string
	Score   float64
	Reasons []string
}

func Score(c Candidate) (float64, []string) {
	base := c.SemanticScore*SemanticWeight + c.KeywordScore*KeywordWeight
	reasons := []string{}
	score := base
	if c.ExactMatch {
		score += ExactBoost
		reasons = append(reasons, "exact-signal")
	}
	if c.ErrorTextMatch {
		score += ErrorTextBoost
		reasons = append(reasons, "error-text")
	}
	if c.BoundaryMatch {
		score += BoundaryBoost
		reasons = append(reasons, "boundary")
	}
	if c.FreshValidation {
		score += FreshBoost
		reasons = append(reasons, "fresh-validation")
	}
	if c.BroadMatch {
		score -= BroadPenalty
		reasons = append(reasons, "broad-penalty")
	}
	if b, ok := authorityBoost[c.SourceKind]; ok {
		score += b
		reasons = append(reasons, "authority:"+c.SourceKind)
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "base")
	}
	return score, reasons
}

func Select(candidates []Candidate, maxResults int) []Scored {
	scored := make([]Scored, 0, len(candidates))
	for _, c := range candidates {
		s, r := Score(c)
		scored = append(scored, Scored{GeneID: c.GeneID, Score: s, Reasons: r})
	}
	sort.Slice(scored, func(a, b int) bool { return scored[a].Score > scored[b].Score })
	if maxResults > 0 && len(scored) > maxResults {
		scored = scored[:maxResults]
	}
	return scored
}

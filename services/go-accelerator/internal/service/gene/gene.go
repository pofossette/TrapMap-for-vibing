package gene

import (
	"sort"
)

const (
	SemanticWeight          = 0.6
	KeywordWeight           = 0.4
	ExactBoost              = 0.1
	ErrorTextBoost          = 0.05
	BoundaryBoost           = 0.05
	FreshBoost              = 0.04
	MissingValidationPenalty = 0.05
	BroadPenalty            = 0.1
)

var authorityBoost = map[string]float64{
	"trap":           0.03,
	"skill-artifact": 0.02,
	"skill-capsule":  0.01,
}

type Candidate struct {
	GeneID          string  `json:"geneId"`
	SemanticScore   float64 `json:"semanticScore"`
	KeywordScore    float64 `json:"keywordScore"`
	ExactMatch      bool    `json:"exactSignalMatch"`
	ErrorTextMatch  bool    `json:"errorTextMatch"`
	BoundaryMatch   bool    `json:"boundaryMatch"`
	FreshValidation bool    `json:"freshValidation"`
	BroadMatch      bool    `json:"broadMatch"`
	SourceKind      string  `json:"sourceKind"`
	ValidationCount *int    `json:"validationCount,omitempty"`
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
	if c.ValidationCount != nil && *c.ValidationCount == 0 {
		score -= MissingValidationPenalty
		reasons = append(reasons, "missing-validation")
	}
	if score < 0 {
		score = 0
	} else if score > 1 {
		score = 1
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
	sort.Slice(scored, func(a, b int) bool {
		if scored[a].Score == scored[b].Score {
			return scored[a].GeneID < scored[b].GeneID
		}
		return scored[a].Score > scored[b].Score
	})
	if maxResults > 0 && len(scored) > maxResults {
		scored = scored[:maxResults]
	}
	return scored
}

package ranking

import (
	"math"
	"sort"
	"strings"
)

const (
	MergeSemanticWeight      = 0.6
	MergeKeywordWeight       = 0.4
	DualChannelRerankBoost   = 0.08
	TokenCoverageRatio       = 0.5
	TokenCoverageBonus       = 0.05
	StaleDecayPenalty        = 0.1
	GraphScoreBoostFactor    = 0.2
)

// Entry mirrors MergedCandidateLike minimal fields for batch ranking.
type Entry struct {
	ID                string             `json:"id"`
	SemanticScore     float64            `json:"semanticScore"`
	KeywordScore      float64            `json:"keywordScore"`
	GraphScore        *float64           `json:"graphScore,omitempty"`
	ChannelScores     map[string]float64 `json:"channelScores"`
	CombinedScore     float64            `json:"combinedScore"`
	TokenMatches      []TokenMatch       `json:"tokenMatches"`
	Channels          []string           `json:"channels"`
	PreRerankScore    float64            `json:"preRerankScore"`
	FinalScore        float64            `json:"finalScore"`
	BoundaryScoreDelta *float64          `json:"boundaryScoreDelta,omitempty"`
	DecayMultiplier   *float64           `json:"decayMultiplier,omitempty"`
	Labels            []string           `json:"labels"`
	Scope             string             `json:"scope"`
	Shortcut          string             `json:"shortcut"`
	Detail            string             `json:"detail"`
	DecayState        *string            `json:"decayState,omitempty"`
	Boundary          *Boundary          `json:"boundary,omitempty"`
}

type TokenMatch struct {
	Token  string   `json:"token"`
	Fields []string `json:"fields"`
}

type Boundary struct {
	Context   []string    `json:"context,omitempty"`
	Exclusions []Exclusion `json:"exclusions,omitempty"`
}

type Exclusion struct {
	Kind        string `json:"kind"`
	Description string `json:"description"`
}

type BoundaryContext struct {
	Contexts []string `json:"contexts"`
	Platform *string  `json:"platform,omitempty"`
}

func normalizeBoundaryLabel(label string) string {
	lower := strings.ToLower(label)
	// replace whitespace with '-'
	var b strings.Builder
	prevDash := false
	for _, r := range lower {
		if r == ' ' || r == '\t' || r == '\n' {
			if !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		} else if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
			prevDash = (r == '-')
		} else {
			// drop other chars like original replace /[^a-z0-9-]/g
		}
	}
	s := b.String()
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}

func computeBoundaryScoreDelta(entry Entry, ctx *BoundaryContext) float64 {
	if ctx == nil || entry.Boundary == nil {
		return 0
	}
	delta := 0.0
	for _, qc := range ctx.Contexts {
		delta += contextScoreDelta(entry, qc)
	}
	if ctx.Platform != nil {
		delta += platformScoreDelta(entry, *ctx.Platform)
	}
	return delta
}

func contextScoreDelta(entry Entry, queryContext string) float64 {
	normalized := normalizeBoundaryLabel(queryContext)
	delta := 0.0
	if entry.Boundary != nil {
		for _, ex := range entry.Boundary.Exclusions {
			if ex.Kind == "context" {
				lowerDesc := strings.ToLower(ex.Description)
				if strings.Contains(lowerDesc, normalized) || strings.Contains(lowerDesc, strings.ToLower(queryContext)) {
					delta -= 0.15
					break
				}
			}
		}
		for _, label := range entry.Boundary.Context {
			if normalizeBoundaryLabel(label) == normalized {
				delta += 0.1
				break
			}
		}
	}
	return delta
}

func platformScoreDelta(entry Entry, platform string) float64 {
	if entry.Boundary == nil {
		return 0
	}
	lowerPlat := strings.ToLower(platform)
	for _, ex := range entry.Boundary.Exclusions {
		if ex.Kind == "platform" && strings.Contains(strings.ToLower(ex.Description), lowerPlat) {
			return -0.15
		}
	}
	return 0
}

// MergeCandidates mirrors backend-core mergeCandidates (weights 0.6/0.4)
func MergeCandidates(semantic, keyword []Entry) []Entry {
	m := make(map[string]*Entry)
	for _, c := range semantic {
		cc := c
		cc.ChannelScores = map[string]float64{"semantic": c.SemanticScore}
		cc.CombinedScore = c.SemanticScore * MergeSemanticWeight
		cc.PreRerankScore = cc.CombinedScore
		cc.FinalScore = cc.CombinedScore
		cc.Channels = []string{"semantic"}
		// normalize fields
		if cc.TokenMatches == nil {
			cc.TokenMatches = []TokenMatch{}
		}
		m[cc.ID] = &cc
	}
	for _, c := range keyword {
		if existing, ok := m[c.ID]; ok {
			existing.KeywordScore = c.SemanticScore // keyword score stored in SemanticScore slot for input
			// Actually keyword input's score is in SemanticScore when using Entry uniformly
			// Prefer explicit KeywordScore if provided
			ks := c.KeywordScore
			if ks == 0 {
				ks = c.SemanticScore
			}
			existing.KeywordScore = ks
			if existing.ChannelScores == nil {
				existing.ChannelScores = map[string]float64{}
			}
			existing.ChannelScores["keyword"] = ks
			existing.TokenMatches = c.TokenMatches
			existing.Channels = []string{"semantic", "keyword"}
			existing.CombinedScore = existing.SemanticScore*MergeSemanticWeight + ks*MergeKeywordWeight
			existing.PreRerankScore = existing.CombinedScore
			existing.FinalScore = existing.CombinedScore
		} else {
			cc := c
			ks := c.KeywordScore
			if ks == 0 {
				ks = c.SemanticScore
			}
			cc.KeywordScore = ks
			cc.SemanticScore = 0
			cc.ChannelScores = map[string]float64{"keyword": ks}
			cc.CombinedScore = ks * MergeKeywordWeight
			cc.PreRerankScore = cc.CombinedScore
			cc.FinalScore = cc.CombinedScore
			cc.Channels = []string{"keyword"}
			if cc.TokenMatches == nil {
				cc.TokenMatches = []TokenMatch{}
			}
			m[cc.ID] = &cc
		}
	}
	out := make([]Entry, 0, len(m))
	for _, v := range m {
		out = append(out, *v)
	}
	sort.Slice(out, func(a, b int) bool {
		if out[a].CombinedScore != out[b].CombinedScore {
			return out[a].CombinedScore > out[b].CombinedScore
		}
		return out[a].ID < out[b].ID
	})
	return out
}

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

// RerankCandidates mirrors backend-core rerankCandidates
func RerankCandidates(candidates []Entry, tokens []string, maxCandidates int, ctx *BoundaryContext) []Entry {
	if len(candidates) == 0 {
		return candidates
	}
	topScore := candidates[0].CombinedScore
	for _, c := range candidates {
		if c.CombinedScore > topScore {
			topScore = c.CombinedScore
		}
	}
	// Early termination threshold not exposed in batch API yet; keep all
	retained := candidates
	// Token coverage bonus prep
	tokenSetSize := len(tokens)
	out := make([]Entry, 0, len(retained))
	for _, c := range retained {
		pre := c.CombinedScore
		final := pre
		if contains(c.Channels, "semantic") && contains(c.Channels, "keyword") {
			final += DualChannelRerankBoost
		}
		if tokenSetSize > 0 {
			uniq := make(map[string]bool)
			for _, tm := range c.TokenMatches {
				uniq[tm.Token] = true
			}
			if float64(len(uniq))/float64(tokenSetSize) >= TokenCoverageRatio {
				final += TokenCoverageBonus
			}
		}
		if c.DecayState != nil && *c.DecayState == "stale" {
			final -= StaleDecayPenalty
		}
		final += computeBoundaryScoreDelta(c, ctx)
		final = math.Max(0, math.Min(1, final))
		cc := c
		cc.PreRerankScore = pre
		cc.CombinedScore = final
		cc.FinalScore = final
		// also set BoundaryScoreDelta for observability
		bd := computeBoundaryScoreDelta(c, ctx)
		cc.BoundaryScoreDelta = &bd
		out = append(out, cc)
	}
	sort.Slice(out, func(a, b int) bool {
		if out[a].CombinedScore != out[b].CombinedScore {
			return out[a].CombinedScore > out[b].CombinedScore
		}
		return out[a].ID < out[b].ID
	})
	if maxCandidates > 0 && len(out) > maxCandidates {
		out = out[:maxCandidates]
	}
	return out
}

func MergeCandidatesWithGraph(hybrid []Entry, graph []Entry) []Entry {
	result := make([]Entry, len(hybrid))
	copy(result, hybrid)
	// map for fast find
	idxByID := make(map[string]int, len(result))
	for i, c := range result {
		idxByID[c.ID] = i
	}
	for _, g := range graph {
		if idx, ok := idxByID[g.ID]; ok {
			existing := &result[idx]
			existing.Channels = append(existing.Channels, "graph")
			if existing.ChannelScores == nil {
				existing.ChannelScores = map[string]float64{}
			}
			gs := g.SemanticScore
			if g.GraphScore != nil {
				gs = *g.GraphScore
			}
			if g.KeywordScore != 0 {
				gs = g.KeywordScore
			}
			existing.GraphScore = &gs
			existing.ChannelScores["graph"] = gs
			pre := existing.CombinedScore
			final := math.Min(1, pre+gs*GraphScoreBoostFactor)
			existing.PreRerankScore = pre
			existing.CombinedScore = final
			existing.FinalScore = final
		} else {
			gs := g.SemanticScore
			if g.GraphScore != nil {
				gs = *g.GraphScore
			}
			// ensure GraphScore set
			ng := gs
			newEntry := g
			newEntry.SemanticScore = 0
			newEntry.KeywordScore = 0
			newEntry.GraphScore = &ng
			newEntry.ChannelScores = map[string]float64{"graph": gs}
			newEntry.CombinedScore = gs
			newEntry.PreRerankScore = gs
			newEntry.FinalScore = gs
			newEntry.Channels = []string{"graph"}
			if newEntry.TokenMatches == nil {
				newEntry.TokenMatches = []TokenMatch{}
			}
			result = append(result, newEntry)
			idxByID[newEntry.ID] = len(result) - 1
		}
	}
	sort.Slice(result, func(a, b int) bool { return result[a].CombinedScore > result[b].CombinedScore })
	return result
}

// ComputeScore mirrors backend-core computeScore
func ComputeScore(similarity float64, labels []string, scope string, filtersLabels []string, filtersScopes []string, seed string, entryLabels []string, entryScope string, entryShortcut string, entryDetail string) float64 {
	score := math.Max(0, math.Min(1, similarity))
	if len(filtersLabels) > 0 {
		matching := 0
		for _, fl := range filtersLabels {
			for _, el := range labels {
				if fl == el {
					matching++
					break
				}
			}
		}
		score = math.Min(1, score+float64(matching)*0.05)
	}
	if len(filtersScopes) == 1 && filtersScopes[0] == scope {
		score = math.Min(1, score+0.03)
	}
	if seed != "" {
		// lexical boost
		queryTokens := tokenize(seed)
		entryText := entryShortcut + "\n" + entryDetail + "\n" + strings.Join(entryLabels, " ")
		entryTokens := tokenize(entryText)
		if len(queryTokens) > 0 && len(entryTokens) > 0 {
			overlap := 0
			entrySet := make(map[string]bool, len(entryTokens))
			for _, t := range entryTokens {
				entrySet[t] = true
			}
			for _, t := range queryTokens {
				if entrySet[t] {
					overlap++
				}
			}
			if overlap > 0 {
				ratio := float64(overlap) / float64(len(queryTokens))
				base := ratio * 0.3
				if ratio >= 1 {
					base = 0.55
				}
				if base > 0.55 {
					base = 0.55
				}
				score = math.Min(1, score+base)
			}
		}
	}
	return score
}

func tokenize(text string) []string {
	// mirrors tokenization normalizeQuery: split on non-alnum, lower, dedup length>=2 not needed for lexical boost
	lower := strings.ToLower(text)
	parts := strings.FieldsFunc(lower, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
	set := make(map[string]bool)
	out := []string{}
	for _, p := range parts {
		if p == "" {
			continue
		}
		if !set[p] {
			set[p] = true
			out = append(out, p)
		}
	}
	return out
}

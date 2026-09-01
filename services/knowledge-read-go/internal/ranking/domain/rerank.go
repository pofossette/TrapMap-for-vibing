package domain

import "sort"

const (
	DualChannelRerankBoost = 0.15
	TokenCoverageBonus     = 0.1
	StaleDecayPenalty      = 0.1
)

func Rerank(entries []Entry, queryTokens []string) []Entry {
	for i := range entries {
		e := &entries[i]
		e.CombinedScore = e.SemanticScore*MergeSemanticWeight + e.KeywordScore*MergeKeywordWeight
		if len(e.Channels) >= 2 {
			e.CombinedScore += DualChannelRerankBoost
		}
		if e.Scope == "stale" {
			e.CombinedScore -= StaleDecayPenalty
		}
		if len(queryTokens) > 0 && len(e.Labels) > 0 {
			e.CombinedScore += TokenCoverageBonus * 0.5
		}
		if e.CombinedScore > 1 {
			e.CombinedScore = 1
		}
		if e.CombinedScore < 0 {
			e.CombinedScore = 0
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].CombinedScore > entries[j].CombinedScore })
	return entries
}

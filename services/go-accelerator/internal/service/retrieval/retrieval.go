package retrieval

import (
	"fmt"
	"sort"
	"strings"
)

type Entry struct {
	ID            string
	Scope         string
	Labels        []string
	RequiredLevel int
	Shortcut      string
	Detail        string
	Score         float64
}

type Filters struct {
	Labels []string
	Scopes []string
}

func GenerateMatchReason(entry Entry, score float64, filters Filters) string {
	parts := []string{}
	if len(filters.Labels) > 0 {
		matched := []string{}
		labelSet := make(map[string]bool, len(entry.Labels))
		for _, l := range entry.Labels {
			labelSet[l] = true
		}
		for _, f := range filters.Labels {
			if labelSet[f] {
				matched = append(matched, f)
			}
		}
		if len(matched) > 0 {
			parts = append(parts, "matches labels: "+strings.Join(matched, ", "))
		}
	}
	if len(filters.Scopes) == 1 && filters.Scopes[0] == entry.Scope {
		parts = append(parts, "scope: "+entry.Scope)
	}
	base := "semantic similarity"
	if len(parts) > 0 {
		base = strings.Join(parts, "; ")
	}
	return fmt.Sprintf("%s (score: %.2f)", base, score)
}

func ScoreEntries(entries []Entry, query string, filters Filters) []Entry {
	normQuery := strings.ToLower(query)
	for i := range entries {
		score := entries[i].Score
		if score == 0 {
			score = 0.5
			for _, fl := range filters.Labels {
				for _, el := range entries[i].Labels {
					if fl == el {
						score += 0.15
					}
				}
			}
			if len(filters.Scopes) == 1 && entries[i].Scope == filters.Scopes[0] {
				score += 0.1
			}
			if strings.Contains(strings.ToLower(entries[i].Detail), normQuery) || strings.Contains(strings.ToLower(entries[i].Shortcut), normQuery) {
				score += 0.2
			}
			if score > 1 {
				score = 1
			}
			entries[i].Score = score
		}
	}
	sort.Slice(entries, func(a, b int) bool { return entries[a].Score > entries[b].Score })
	return entries
}

func AssembleBuckets(entries []Entry, filters Filters) (global []Entry, project []Entry) {
	for _, e := range entries {
		if e.Scope == "global" {
			global = append(global, e)
		} else {
			project = append(project, e)
		}
	}
	if global == nil {
		global = []Entry{}
	}
	if project == nil {
		project = []Entry{}
	}
	return global, project
}

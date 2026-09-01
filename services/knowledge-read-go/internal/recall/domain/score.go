package domain

import (
	"math"
	"strings"
)

const (
	KeywordLabelWeight    = 3.0
	KeywordShortcutWeight = 2.0
	KeywordDetailWeight   = 1.0
)

func Cosine(a, b []float64) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var dot, na, nb float64
	for i := 0; i < n; i++ {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

func KeywordScore(queryTokens []string, labels, shortcut, detail map[string]struct{}) (float64, []string) {
	if len(queryTokens) == 0 {
		return 0, nil
	}
	maxField := KeywordLabelWeight + KeywordShortcutWeight + KeywordDetailWeight
	var total, maxPossible float64
	var matched []string
	for _, tok := range queryTokens {
		fields := 0.0
		hit := false
		if _, ok := labels[tok]; ok {
			fields += KeywordLabelWeight
			hit = true
		}
		if _, ok := shortcut[tok]; ok {
			fields += KeywordShortcutWeight
			hit = true
		}
		if _, ok := detail[tok]; ok {
			fields += KeywordDetailWeight
			hit = true
		}
		if hit {
			matched = append(matched, tok)
		}
		total += fields
		maxPossible += maxField
	}
	if maxPossible == 0 {
		return 0, matched
	}
	return total / maxPossible, matched
}

func TokenizeSet(text string) map[string]struct{} {
	lower := strings.ToLower(text)
	parts := strings.FieldsFunc(lower, func(r rune) bool { return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_') })
	m := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		if p != "" {
			m[p] = struct{}{}
		}
	}
	return m
}

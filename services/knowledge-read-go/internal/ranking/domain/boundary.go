package domain

import "strings"

type Boundary struct {
	Context    []string
	Exclusions []Exclusion
}

type Exclusion struct {
	Kind        string
	Description string
}

func BoundaryDelta(b *Boundary, queryContext string) float64 {
	if b == nil || queryContext == "" {
		return 0
	}
	q := normalize(queryContext)
	delta := 0.0
	for _, ex := range b.Exclusions {
		if ex.Kind == "context" && strings.Contains(strings.ToLower(ex.Description), q) {
			delta -= 0.15
			break
		}
	}
	for _, c := range b.Context {
		if normalize(c) == q {
			delta += 0.1
			break
		}
	}
	return delta
}

func normalize(s string) string {
	lower := strings.ToLower(s)
	var b strings.Builder
	prevDash := false
	for _, r := range lower {
		if r == ' ' || r == '\t' {
			if !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		} else if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' {
			b.WriteRune(r)
			prevDash = r == '-'
		}
	}
	res := b.String()
	if len(res) > 64 {
		res = res[:64]
	}
	return res
}

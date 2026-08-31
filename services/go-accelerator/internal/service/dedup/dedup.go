package dedup

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func Fingerprint(parts []string) string {
	h := sha256.New()
	for i, p := range parts {
		if i > 0 {
			h.Write([]byte{'\n'})
		}
		h.Write([]byte(p))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func normalizeToken(t string) string {
	return strings.ToLower(t)
}

func tokens(text string) []string {
	lower := strings.ToLower(text)
	parts := strings.FieldsFunc(lower, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
	set := make(map[string]bool)
	out := []string{}
	for _, p := range parts {
		if len(p) < 3 {
			continue
		}
		if !set[p] {
			set[p] = true
			out = append(out, p)
		}
	}
	return out
}

func JaccardSimilarity(left, right []string) float64 {
	if len(left) == 0 || len(right) == 0 {
		return 0
	}
	lset := make(map[string]bool, len(left))
	for _, t := range left {
		lset[normalizeToken(t)] = true
	}
	rset := make(map[string]bool, len(right))
	for _, t := range right {
		rset[normalizeToken(t)] = true
	}
	shared := 0
	for k := range lset {
		if rset[k] {
			shared++
		}
	}
	union := len(lset) + len(rset) - shared
	if union == 0 {
		return 0
	}
	return float64(shared) / float64(union)
}

func TokenSimilarity(leftText, rightText string) float64 {
	return JaccardSimilarity(tokens(leftText), tokens(rightText))
}

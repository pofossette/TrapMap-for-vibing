package domain

import (
	"regexp"
	"strings"
)

var wordRe = regexp.MustCompile(`[\p{L}\p{N}_]+`)

const (
	KeywordLabelWeight    = 3.0
	KeywordShortcutWeight = 2.0
	KeywordDetailWeight   = 1.0
)

func Tokenize(text string) []string {
	if text == "" {
		return []string{}
	}
	lower := strings.ToLower(text)
	matches := wordRe.FindAllString(lower, -1)
	if matches == nil {
		return []string{}
	}
	return matches
}

func TokenizeSet(text string) map[string]struct{} {
	toks := Tokenize(text)
	m := make(map[string]struct{}, len(toks))
	for _, t := range toks {
		m[t] = struct{}{}
	}
	return m
}

func NormalizeQuery(query string) []string {
	toks := Tokenize(query)
	out := make([]string, 0, len(toks))
	for _, t := range toks {
		if len(t) >= 2 {
			out = append(out, t)
		}
	}
	return out
}

func Chunk(text string, chunkSize, overlap int) []string {
	if chunkSize <= 0 {
		chunkSize = 512
	}
	if overlap < 0 {
		overlap = 0
	}
	if overlap >= chunkSize {
		overlap = chunkSize - 1
	}
	toks := Tokenize(text)
	if len(toks) == 0 {
		return []string{}
	}
	var chunks []string
	step := chunkSize - overlap
	for i := 0; i < len(toks); i += step {
		end := i + chunkSize
		if end > len(toks) {
			end = len(toks)
		}
		chunks = append(chunks, strings.Join(toks[i:end], " "))
		if end == len(toks) {
			break
		}
	}
	return chunks
}

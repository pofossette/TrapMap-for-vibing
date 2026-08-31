package tokenize

import (
	"regexp"
	"strings"
)

var wordRe = regexp.MustCompile(`[\p{L}\p{N}_]+`)

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
	tokens := Tokenize(text)
	if len(tokens) == 0 {
		return []string{}
	}
	var chunks []string
	step := chunkSize - overlap
	for i := 0; i < len(tokens); i += step {
		end := i + chunkSize
		if end > len(tokens) {
			end = len(tokens)
		}
		chunks = append(chunks, strings.Join(tokens[i:end], " "))
		if end == len(tokens) {
			break
		}
	}
	return chunks
}

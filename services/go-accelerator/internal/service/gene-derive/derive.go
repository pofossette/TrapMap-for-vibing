package genederive

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"sync"
)

var sectionNames = []string{"MATCH", "GOAL", "STRATEGY", "AVOID", "VERIFY"}

type sectionPattern struct {
	heading *regexp.Regexp
	inline  *regexp.Regexp
}

var sectionPatterns map[string]sectionPattern

func init() {
	sectionPatterns = make(map[string]sectionPattern, len(sectionNames))
	for _, name := range sectionNames {
		heading := regexp.MustCompile(`(?i)^\s*(?:#{1,6}\s*)?(?:\d+[.)]\s*)?` + name + `(?:\s*:|$)`)
		inline := regexp.MustCompile(`(?i)^\s*(?:#{1,6}\s*)?(?:\d+[.)]\s*)?` + name + `\s*:\s*(.+)$`)
		sectionPatterns[name] = sectionPattern{heading: heading, inline: inline}
	}
}

func sectionName(line string) string {
	for _, name := range sectionNames {
		if sectionPatterns[name].heading.MatchString(line) {
			return name
		}
	}
	return ""
}

func cleanListItem(line string) string {
	s := strings.TrimSpace(line)
	s = regexp.MustCompile(`^[-*+]\s+`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`^\d+[.)]\s+`).ReplaceAllString(s, "")
	return s
}

func sectionLines(text, target string) []string {
	collected := []string{}
	active := false
	pat := sectionPatterns[target]
	for _, rawLine := range strings.Split(text, "\n") {
		lines := strings.Split(rawLine, "\r")
		for _, l := range lines {
			_ = l
		}
		nextName := sectionName(rawLine)
		stop := false
		wasActive := active
		if nextName != "" {
			nowActive := nextName == target
			stop = wasActive && !nowActive
			active = nowActive
			if nowActive {
				if m := pat.inline.FindStringSubmatch(rawLine); len(m) > 1 && strings.TrimSpace(m[1]) != "" {
					collected = append(collected, strings.TrimSpace(m[1]))
				}
			}
		}
		if stop {
			break
		}
		if active && strings.TrimSpace(rawLine) != "" && sectionName(rawLine) == "" {
			collected = append(collected, cleanListItem(rawLine))
		}
	}
	return collected
}

func canonicalJSON(v interface{}) (string, error) {
	// deterministic: sort keys
	b, err := marshalCanonical(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func marshalCanonical(v interface{}) ([]byte, error) {
	switch val := v.(type) {
	case nil:
		return []byte("null"), nil
	case map[string]interface{}:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := []byte("{")
		for i, k := range keys {
			if i > 0 {
				out = append(out, ',')
			}
			kb, _ := json.Marshal(k)
			out = append(out, kb...)
			out = append(out, ':')
			vb, err := marshalCanonical(val[k])
			if err != nil {
				return nil, err
			}
			out = append(out, vb...)
		}
		out = append(out, '}')
		return out, nil
	case []interface{}:
		out := []byte("[")
		for i, e := range val {
			if i > 0 {
				out = append(out, ',')
			}
			b, err := marshalCanonical(e)
			if err != nil {
				return nil, err
			}
			out = append(out, b...)
		}
		out = append(out, ']')
		return out, nil
	default:
		return json.Marshal(v)
	}
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

type TrapInput struct {
	TrapID           string `json:"trapId"`
	TrapText         string `json:"trapText"`
	DerivationUnitID string `json:"derivationUnitId"`
}

type Sections struct {
	MATCH    []string `json:"MATCH"`
	GOAL     []string `json:"GOAL"`
	STRATEGY []string `json:"STRATEGY"`
	AVOID    []string `json:"AVOID"`
	VERIFY   []string `json:"VERIFY"`
}

type Result struct {
	TrapID           string   `json:"trapId"`
	DerivationUnitID string   `json:"derivationUnitId"`
	Sections         Sections `json:"sections"`
	ContentHash      string   `json:"contentHash"`
	SourceHash       string   `json:"sourceHash"`
}

// deriveOne does 10 regex + 2×canonical hash per trap (mirrors backend-core)
func deriveOne(in TrapInput) Result {
	secs := Sections{
		MATCH:    sectionLines(in.TrapText, "MATCH"),
		GOAL:     sectionLines(in.TrapText, "GOAL"),
		STRATEGY: sectionLines(in.TrapText, "STRATEGY"),
		AVOID:    sectionLines(in.TrapText, "AVOID"),
		VERIFY:   sectionLines(in.TrapText, "VERIFY"),
	}
	// contentHash: projection of sections + trapId + derivationUnitId (simplified)
	proj := map[string]interface{}{
		"trapId":           in.TrapID,
		"derivationUnitId": in.DerivationUnitID,
		"sections": map[string]interface{}{
			"MATCH":    secs.MATCH,
			"GOAL":     secs.GOAL,
			"STRATEGY": secs.STRATEGY,
			"AVOID":    secs.AVOID,
			"VERIFY":   secs.VERIFY,
		},
	}
	canonical, _ := canonicalJSON(proj)
	contentHash := sha256Hex(canonical)
	// sourceHash: hash of trapText
	sourceHash := sha256Hex(in.TrapText)
	return Result{
		TrapID:           in.TrapID,
		DerivationUnitID: in.DerivationUnitID,
		Sections:         secs,
		ContentHash:      contentHash,
		SourceHash:       sourceHash,
	}
}

func DeriveBatch(inputs []TrapInput) []Result {
	if len(inputs) == 0 {
		return []Result{}
	}
	results := make([]Result, len(inputs))
	var wg sync.WaitGroup
	// 32 shard similar to vector batch
	const shardSize = 32
	for start := 0; start < len(inputs); start += shardSize {
		end := start + shardSize
		if end > len(inputs) {
			end = len(inputs)
		}
		wg.Add(1)
		go func(s, e int) {
			defer wg.Done()
			for i := s; i < e; i++ {
				results[i] = deriveOne(inputs[i])
			}
		}(start, end)
	}
	wg.Wait()
	return results
}

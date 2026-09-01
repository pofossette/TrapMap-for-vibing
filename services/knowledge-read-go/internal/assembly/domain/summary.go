package domain

import "strings"

func Summarize(entries []Entry, limit int) string {
	if len(entries) == 0 {
		return ""
	}
	if limit <= 0 {
		limit = 3
	}
	if limit > len(entries) {
		limit = len(entries)
	}
	var b strings.Builder
	for i := 0; i < limit; i++ {
		if i > 0 {
			b.WriteString(" | ")
		}
		b.WriteString(entries[i].ID)
		b.WriteString(":")
		d := entries[i].Detail
		if len(d) > 80 {
			d = d[:80]
		}
		b.WriteString(d)
	}
	return b.String()
}

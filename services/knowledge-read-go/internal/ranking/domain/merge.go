package domain

const (
	MergeSemanticWeight = 0.6
	MergeKeywordWeight  = 0.4
)

type Entry struct {
	ID            string
	SemanticScore float64
	KeywordScore  float64
	GraphScore    *float64
	CombinedScore float64
	Channels      []string
	Labels        []string
	Scope         string
}

func Merge(semantic, keyword map[string]float64, ids []string) []Entry {
	out := make([]Entry, 0, len(ids))
	for _, id := range ids {
		s := semantic[id]
		k := keyword[id]
		combined := s*MergeSemanticWeight + k*MergeKeywordWeight
		var ch []string
		if s > 0 {
			ch = append(ch, "semantic")
		}
		if k > 0 {
			ch = append(ch, "keyword")
		}
		out = append(out, Entry{ID: id, SemanticScore: s, KeywordScore: k, CombinedScore: combined, Channels: ch})
	}
	return out
}

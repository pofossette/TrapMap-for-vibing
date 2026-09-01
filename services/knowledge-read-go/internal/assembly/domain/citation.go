package domain

type Entry struct {
	ID     string
	Scope  string
	Detail string
}

type Citation struct {
	ID     string `json:"id"`
	Scope  string `json:"scope"`
	Detail string `json:"detail"`
}

func Build(entries []Entry) []Citation {
	out := make([]Citation, 0, len(entries))
	for _, e := range entries {
		out = append(out, Citation{ID: e.ID, Scope: e.Scope, Detail: e.Detail})
	}
	return out
}

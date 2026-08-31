package api

type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
}

type CanonicalHashRequest struct {
	Payload interface{} `json:"payload"`
}

type CanonicalHashResponse struct {
	Canonical string `json:"canonical"`
	Hash      string `json:"hash"`
}

type VectorCosineRequest struct {
	A []float64 `json:"a"`
	B []float64 `json:"b"`
}

type VectorCosineResponse struct {
	Similarity float64 `json:"similarity"`
	NormA      float64 `json:"normA"`
	NormB      float64 `json:"normB"`
}

type BatchCosineRequest struct {
	Query   []float64   `json:"query"`
	Vectors [][]float64 `json:"vectors"`
}

type BatchCosineResponse struct {
	Scores []float64 `json:"scores"`
}

type TokenizeRequest struct {
	Text      string `json:"text"`
	MaxTokens *int   `json:"maxTokens,omitempty"`
	ChunkSize *int   `json:"chunkSize,omitempty"`
	Overlap   *int   `json:"overlap,omitempty"`
}

type TokenizeResponse struct {
	Tokens []string `json:"tokens"`
	Chunks []string `json:"chunks"`
	Count  int      `json:"count"`
}

type RetrievalScoreEntry struct {
	ID            string   `json:"id"`
	Scope         string   `json:"scope"`
	Labels        []string `json:"labels"`
	RequiredLevel int      `json:"requiredLevel"`
	Shortcut      string   `json:"shortcut"`
	Detail        string   `json:"detail"`
	Score         float64  `json:"score,omitempty"`
}

type RetrievalScoreRequest struct {
	Entries []RetrievalScoreEntry `json:"entries"`
	Query   string                `json:"query"`
	Filters struct {
		Labels []string `json:"labels"`
		Scopes []string `json:"scopes"`
	} `json:"filters"`
	Limit *int `json:"limit,omitempty"`
}

type RetrievalScoreResponse struct {
	GlobalConstraints []RetrievalScoreEntry `json:"globalConstraints"`
	ProjectKnowledge  []RetrievalScoreEntry `json:"projectKnowledge"`
	Reason            string                `json:"reason"`
}

type GeneCandidate struct {
	GeneID          string  `json:"geneId"`
	Title           string  `json:"title"`
	SemanticScore   float64 `json:"semanticScore"`
	KeywordScore    float64 `json:"keywordScore"`
	ExactMatch      bool    `json:"exactSignalMatch"`
	ErrorTextMatch  bool    `json:"errorTextMatch"`
	BoundaryMatch   bool    `json:"boundaryMatch"`
	FreshValidation bool    `json:"freshValidation"`
	BroadMatch      bool    `json:"broadMatch"`
	SourceKind      string  `json:"sourceKind"`
}

type GeneSelectRequest struct {
	Candidates []GeneCandidate `json:"candidates"`
	Query      string          `json:"query"`
	MaxResults *int            `json:"maxResults,omitempty"`
}

type ScoredGene struct {
	GeneID string   `json:"geneId"`
	Score  float64  `json:"score"`
	Reasons []string `json:"reasons"`
}

type GeneSelectResponse struct {
	Selected []ScoredGene `json:"selected"`
	Warnings []string     `json:"warnings,omitempty"`
}

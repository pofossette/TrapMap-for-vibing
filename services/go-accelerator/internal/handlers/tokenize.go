package handlers

import (
	"encoding/json"
	"net/http"

	"trapmap-go-accelerator/internal/service/tokenize"
	"trapmap-go-accelerator/pkg/api"
)

func Tokenize(w http.ResponseWriter, r *http.Request) {
	var req api.TokenizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tokens := tokenize.Tokenize(req.Text)
	chunkSize := 512
	if req.ChunkSize != nil {
		chunkSize = *req.ChunkSize
	}
	overlap := 50
	if req.Overlap != nil {
		overlap = *req.Overlap
	}
	chunks := tokenize.Chunk(req.Text, chunkSize, overlap)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(api.TokenizeResponse{Tokens: tokens, Chunks: chunks, Count: len(tokens)})
}

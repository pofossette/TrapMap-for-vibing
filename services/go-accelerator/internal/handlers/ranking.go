// Deprecated: removed — use knowledge-read-go/internal/ranking/domain — see DEPRECATED.md and docs/archived/GO_ACCELERATOR_FUNCTION_RETIREMENT.md
package handlers

import (
	"encoding/json"
	"net/http"
)

func RankingBatch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Deprecated", "use knowledge-read-go")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusGone)
	json.NewEncoder(w).Encode(map[string]string{"error": "moved to knowledge-read-go", "code": "410"})
}

func KeywordScore(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Deprecated", "use knowledge-read-go")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusGone)
	json.NewEncoder(w).Encode(map[string]string{"error": "moved to knowledge-read-go", "code": "410"})
}

// Deprecated: removed — use knowledge-read-go/internal/recall — see DEPRECATED.md
package handlers

import (
	"encoding/json"
	"net/http"
)

func RetrievalScore(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Deprecated", "use knowledge-read-go")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusGone)
	json.NewEncoder(w).Encode(map[string]string{"error": "moved to knowledge-read-go", "code": "410"})
}

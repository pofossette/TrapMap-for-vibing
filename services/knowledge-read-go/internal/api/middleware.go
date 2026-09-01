package api

import (
	"net/http"

	"trapmap-knowledge-read-go/internal/observability"
)

func Middleware(next http.Handler) http.Handler {
	return observability.Logging(next)
}

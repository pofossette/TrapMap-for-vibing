package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"trapmap-knowledge-read-go/internal/observability"
)

func NewRouter(h *Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(Middleware)
	r.Use(middleware.Timeout(8000 * 1e6))

	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)
	r.Handle("/metrics", observability.Handler())
	r.Get("/v1/health", h.Health)
	r.Post("/v1/knowledge/read", h.Read)
	return r
}

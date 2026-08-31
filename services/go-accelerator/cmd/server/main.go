package main

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"trapmap-go-accelerator/internal/config"
	"trapmap-go-accelerator/internal/handlers"
	mware "trapmap-go-accelerator/internal/middleware"
)

func main() {
	cfg := config.Load()
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(mware.Logging)
	r.Use(middleware.Timeout(time.Duration(cfg.WriteTimeoutMs) * time.Millisecond))

	r.Get("/health", handlers.Health)
	r.Get("/ready", handlers.Ready)
	r.Get("/v1/health", handlers.Health)

	r.Post("/v1/hash/canonical", handlers.CanonicalHash)
	r.Post("/v1/vector/cosine", handlers.Cosine)
	r.Post("/v1/vector/batch-cosine", handlers.BatchCosine)
	r.Post("/v1/text/tokenize", handlers.Tokenize)
	r.Post("/v1/retrieval/score", handlers.RetrievalScore)
	r.Post("/v1/gene/select", handlers.GeneSelect)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  time.Duration(cfg.ReadTimeoutMs) * time.Millisecond,
		WriteTimeout: time.Duration(cfg.WriteTimeoutMs) * time.Millisecond,
		IdleTimeout:  60 * time.Second,
	}
	log.Printf("go-accelerator listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}

package main

import (
	"log"
	"net/http"
	"time"

	"trapmap-knowledge-read-go/internal/api"
	assemblySvc "trapmap-knowledge-read-go/internal/assembly/service"
	"trapmap-knowledge-read-go/internal/cache"
	"trapmap-knowledge-read-go/internal/config"
	querySvc "trapmap-knowledge-read-go/internal/query/service"
	rankingSvc "trapmap-knowledge-read-go/internal/ranking/service"
	recallSvc "trapmap-knowledge-read-go/internal/recall/service"
	"trapmap-knowledge-read-go/internal/recall/store"
)

func main() {
	cfg := config.Load()
	c := cache.New(cfg.CacheSize)

	q := querySvc.New(c)
	pgStore := store.NewPG(nil)
	sem := recallSvc.NewSemantic(pgStore, c)
	kw := recallSvc.NewKeyword(pgStore)
	graph := recallSvc.NewGraph(pgStore)
	rank := rankingSvc.New()
	asm := assemblySvc.New()

	h := api.NewHandler(q, sem, kw, graph, rank, asm)
	router := api.NewRouter(h)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  time.Duration(cfg.ReadTimeoutMs) * 1e6,
		WriteTimeout: time.Duration(cfg.WriteTimeoutMs) * 1e6,
		IdleTimeout:  60 * time.Second,
	}
	log.Printf("knowledge-read-go listening on :%s impl=%s", cfg.Port, cfg.ReadImpl)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}

package observability

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"
)

var logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

func Logger() *slog.Logger { return logger }

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		dur := time.Since(start).Milliseconds()
		ObserveDuration(r.Method+" "+r.URL.Path, routeModule(r.URL.Path), float64(dur))
		IncRequest(r.Method+" "+r.URL.Path, statusText(sw.status), routeModule(r.URL.Path))
		logger.Info("request", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Int("status", sw.status), slog.Int64("dur_ms", dur), slog.String("module", routeModule(r.URL.Path)))
		_ = context.Background()
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }

func statusText(c int) string {
	if c >= 200 && c < 300 {
		return "2xx"
	}
	if c >= 400 && c < 500 {
		return "4xx"
	}
	if c >= 500 {
		return "5xx"
	}
	return "other"
}

func routeModule(path string) string {
	switch path {
	case "/v1/knowledge/read":
		return "recall"
	case "/health", "/ready":
		return "api"
	default:
		if len(path) >= 4 && path[:4] == "/v1/" {
			return "api"
		}
		return "other"
	}
}

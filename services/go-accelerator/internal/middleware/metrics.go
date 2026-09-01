package middleware

import (
	"net/http"
	"time"

	"trapmap-go-accelerator/internal/observability"
)

func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)
		route := r.Method + " " + r.URL.Path
		observability.IncRequest(route, itoaStatus(rw.status))
		observability.ObserveDuration(route, time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}
func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }
func itoaStatus(s int) string {
	if s==200 { return "200" }
	if s==404 { return "404" }
	if s==500 { return "500" }
	return "other"
}

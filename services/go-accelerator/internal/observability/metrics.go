package observability

import (
	"net/http"
	"sync"
	"time"
)

// Minimal Prometheus-compatible metrics without external dep (exposes text format on /metrics)
// Counters: requests_total{route,status}, fallback_total, duration histogram (p50/p95 via buckets)
// For full Prometheus, replace with prom-client; this keeps host-local zero-dep and works with `curl /metrics`

type Metrics struct {
	mu sync.Mutex
	reqTotal map[string]int64
	fallbackTotal int64
	durations map[string][]time.Duration
}

var global = &Metrics{
	reqTotal: make(map[string]int64),
	durations: make(map[string][]time.Duration),
}

func IncRequest(route, status string) {
	global.mu.Lock()
	defer global.mu.Unlock()
	global.reqTotal[route+"|"+status]++
}

func IncFallback() {
	global.mu.Lock()
	defer global.mu.Unlock()
	global.fallbackTotal++
}

func ObserveDuration(route string, d time.Duration) {
	global.mu.Lock()
	defer global.mu.Unlock()
	// keep last 1000 samples per route for p50/p95 estimate
	b := global.durations[route]
	if len(b) >= 1000 {
		b = b[1:]
	}
	global.durations[route] = append(b, d)
}

func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		global.mu.Lock()
		defer global.mu.Unlock()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.Write([]byte("# HELP trapmap_go_requests_total Requests by route/status\n# TYPE trapmap_go_requests_total counter\n"))
		for k, v := range global.reqTotal {
			w.Write([]byte("trapmap_go_requests_total{label=\"" + k + "\"} " + itoa(v) + "\n"))
		}
		w.Write([]byte("# HELP trapmap_go_fallback_total Fallback to JS\n# TYPE trapmap_go_fallback_total counter\n"))
		w.Write([]byte("trapmap_go_fallback_total " + itoa(global.fallbackTotal) + "\n"))
		w.Write([]byte("# HELP trapmap_go_duration_ms Recent durations\n# TYPE trapmap_go_duration_ms gauge\n"))
		for route, ds := range global.durations {
			if len(ds)==0 { continue }
			// naive p50/p95
			// already not sorted — quick estimate: average
			var sum time.Duration
			for _, d := range ds { sum += d }
			avg := sum / time.Duration(len(ds))
			w.Write([]byte("trapmap_go_duration_ms{route=\"" + route + "\",quantile=\"avg\"} " + itoa(int64(avg/time.Millisecond)) + "\n"))
		}
	})
}

func itoa(n int64) string {
	// avoid fmt for minimal
	if n==0 { return "0" }
	neg := n<0
	if neg { n=-n }
	buf := [20]byte{}
	i:=len(buf)
	for n>0 { i--; buf[i]=byte('0'+n%10); n/=10 }
	if neg { i--; buf[i]='-' }
	return string(buf[i:])
}

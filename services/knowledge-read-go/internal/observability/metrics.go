package observability

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	requestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "trapmap_knowledge_read_requests_total",
		Help: "Requests by route/status/module",
	}, []string{"route", "status", "module"})

	fallbackTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "trapmap_knowledge_read_fallback_total",
		Help: "Fallback to Node per module",
	}, []string{"module"})

	durationHist = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "trapmap_knowledge_read_duration_ms",
		Help: "Duration ms by route/module",
		Buckets: []float64{5, 10, 20, 40, 80, 160, 320},
	}, []string{"route", "module"})
)

func init() {
	prometheus.MustRegister(requestsTotal, fallbackTotal, durationHist)
}

func IncRequest(route, status, module string) {
	requestsTotal.WithLabelValues(route, status, module).Inc()
}

func IncFallback(module string) {
	fallbackTotal.WithLabelValues(module).Inc()
}

func ObserveDuration(route, module string, ms float64) {
	durationHist.WithLabelValues(route, module).Observe(ms)
}

func Handler() http.Handler { return promhttp.Handler() }

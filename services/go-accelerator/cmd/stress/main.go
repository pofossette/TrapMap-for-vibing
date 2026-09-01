package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Scenario describes a single pressure test scenario.
type Scenario struct {
	Name       string
	URLPath    string
	Payload    []byte
	VUs        int
	Duration   time.Duration
	Thresholds Thresholds
}

type Thresholds struct {
	P95Ms      float64
	P99Ms      float64
	MaxFailRate float64
}

type Result struct {
	Scenario   string  `json:"scenario"`
	URL        string  `json:"url"`
	VUs        int     `json:"vus"`
	DurationMs int64   `json:"durationMs"`
	TotalReqs  int64   `json:"totalReqs"`
	SuccessReqs int64  `json:"successReqs"`
	FailReqs   int64   `json:"failReqs"`
	FailRate   float64 `json:"failRate"`
	RPS        float64 `json:"rps"`
	P50Ms      float64 `json:"p50Ms"`
	P95Ms      float64 `json:"p95Ms"`
	P99Ms      float64 `json:"p99Ms"`
	MinMs      float64 `json:"minMs"`
	MaxMs      float64 `json:"maxMs"`
	AvgMs      float64 `json:"avgMs"`
	ThresholdPass bool `json:"thresholdPass"`
	Message    string `json:"message,omitempty"`
}

func main() {
	var (
		scenarioFlag = flag.String("scenario", "all", "scenario: batch-cosine|ranking-batch|dedup-flood|gene-derive|all")
		baseURL      = flag.String("url", "http://localhost:4100", "base URL of go-accelerator")
		vusOverride  = flag.Int("vus", 0, "override VUs (0 = use scenario default)")
		durOverride  = flag.Duration("duration", 0, "override duration (e.g., 10s, 0 = default)")
		outFile      = flag.String("out", "", "output JSON file (default benchmarks/results/stress-go-<scenario>.json)")
		checkFlag    = flag.Bool("check", false, "fail exit code if thresholds not met")
		listFlag     = flag.Bool("list", false, "list scenarios and exit")
	)
	flag.Parse()

	scenarios := allScenarios(*baseURL)

	if *listFlag {
		fmt.Println("available scenarios:")
		for _, s := range scenarios {
			fmt.Printf("  %-15s VUs=%d duration=%s p95<%.0fms p99<%.0fms -> %s\n", s.Name, s.VUs, s.Duration, s.Thresholds.P95Ms, s.Thresholds.P99Ms, s.URLPath)
		}
		return
	}

	var toRun []Scenario
	if *scenarioFlag == "all" {
		toRun = scenarios
	} else {
		found := false
		for _, s := range scenarios {
			if s.Name == *scenarioFlag {
				toRun = []Scenario{s}
				found = true
				break
			}
		}
		if !found {
			log.Fatalf("unknown scenario %q, use -list", *scenarioFlag)
		}
	}

	// Apply overrides
	for i := range toRun {
		if *vusOverride > 0 {
			toRun[i].VUs = *vusOverride
		}
		if *durOverride > 0 {
			toRun[i].Duration = *durOverride
		}
		// resolve full URL
		toRun[i].URLPath = *baseURL + toRun[i].URLPath
	}

	// ensure results dir (repo root aware)
	_ = os.MkdirAll(resolveResultsDir(), 0755)

	var allResults []Result
	failed := false
	for _, sc := range toRun {
		fmt.Printf("\n=== scenario %-15s VUs=%d duration=%s -> %s ===\n", sc.Name, sc.VUs, sc.Duration, sc.URLPath)
		res := runScenario(sc)
		allResults = append(allResults, res)
		printResult(res)
		if !res.ThresholdPass {
			failed = true
			fmt.Printf("  ✗ threshold failed: p95 %.2fms > %.0fms or failRate %.2f%% > %.0f%%\n", res.P95Ms, sc.Thresholds.P95Ms, res.FailRate*100, sc.Thresholds.MaxFailRate*100)
		} else {
			fmt.Printf("  ✓ thresholds pass\n")
		}

		// write per-scenario json
		outPath := *outFile
		if outPath == "" {
			outPath = filepath.Join("benchmarks/results", fmt.Sprintf("stress-go-%s.json", sc.Name))
		} else if len(toRun) > 1 {
			// when running all, make per-scenario file
			ext := filepath.Ext(outPath)
			base := outPath[:len(outPath)-len(ext)]
			outPath = fmt.Sprintf("%s-%s%s", base, sc.Name, ext)
			if *outFile == "" {
				outPath = filepath.Join("benchmarks/results", fmt.Sprintf("stress-go-%s.json", sc.Name))
			}
		}
		if err := writeJSON(outPath, res); err != nil {
			log.Printf("write %s failed: %v", outPath, err)
		} else {
			fmt.Printf("  → %s\n", outPath)
		}
	}

	// when running all, also write aggregated
	if len(toRun) > 1 && *outFile == "" {
		aggPath := "benchmarks/results/stress-go-all.json"
		_ = writeJSON(aggPath, allResults)
		fmt.Printf("\n→ %s (aggregated)\n", aggPath)
	} else if len(toRun) > 1 && *outFile != "" {
		_ = writeJSON(*outFile, allResults)
		fmt.Printf("\n→ %s (aggregated)\n", *outFile)
	}

	// also try to collect /metrics
	if len(toRun) > 0 {
		metricsURL := *baseURL + "/metrics"
		if data, err := httpGet(metricsURL); err == nil {
			fmt.Printf("\n--- Go /metrics (sample) ---\n%s\n", firstLines(string(data), 20))
		}
	}

	if *checkFlag && failed {
		os.Exit(1)
	}
}

func allScenarios(base string) []Scenario {
	// NOTE: pressure default is read-heavy 50:1. The ` + "`mixed-50-1`" + ` scenario models this by interleaving 50 reads per 1 write.
	// Individual scenarios (batch-cosine/ranking-batch = read, dedup-flood/gene-derive = write) keep their own thresholds for isolated runs.
	// `-scenario all` runs the four isolated scenarios sequentially; `-scenario mixed-50-1` runs the read-heavy mix.
	// payloads are pre-generated deterministically (seed 42) to avoid per-iteration JSON marshalling overhead
	rand.Seed(42)
	return []Scenario{
		{
			Name:    "batch-cosine",
			URLPath: "/v1/vector/batch-cosine",
			Payload: batchCosinePayload(1000, 384),
			VUs:     50,
			Duration: 10 * time.Second,
			Thresholds: Thresholds{P95Ms: 15, P99Ms: 30, MaxFailRate: 0},
		},
		{
			Name:    "ranking-batch",
			URLPath: "/v1/retrieval/ranking-batch",
			Payload: rankingBatchPayload(1000),
			VUs:     30,
			Duration: 10 * time.Second,
			Thresholds: Thresholds{P95Ms: 20, P99Ms: 40, MaxFailRate: 0},
		},
		{
			Name:    "dedup-flood",
			URLPath: "/v1/dedup/fingerprint",
			Payload: dedupFingerprintPayload(),
			VUs:     100,
			Duration: 10 * time.Second,
			Thresholds: Thresholds{P95Ms: 10, P99Ms: 20, MaxFailRate: 0},
		},
		{
			Name:    "mixed-50-1",
			URLPath: "/mixed-50-1",
			Payload: nil,
			VUs:     50,
			Duration: 10 * time.Second,
			Thresholds: Thresholds{P95Ms: 20, P99Ms: 40, MaxFailRate: 0},
		},
		{
			Name:    "gene-derive",
			URLPath: "/v1/gene/derive-batch",
			Payload: geneDerivePayload(200),
			VUs:     10,
			Duration: 10 * time.Second,
			Thresholds: Thresholds{P95Ms: 50, P99Ms: 100, MaxFailRate: 0},
		},
	}
}

func batchCosinePayload(n, dim int) []byte {
	query := make([]float64, dim)
	for i := range query {
		query[i] = rand.Float64()*2 - 1
	}
	vectors := make([][]float64, n)
	for i := range vectors {
		v := make([]float64, dim)
		for j := range v {
			v[j] = rand.Float64()*2 - 1
		}
		vectors[i] = v
	}
	b, _ := json.Marshal(map[string]interface{}{"query": query, "vectors": vectors})
	return b
}

func rankingBatchPayload(n int) []byte {
	entries := make([]map[string]interface{}, n)
	for i := 0; i < n; i++ {
		entries[i] = map[string]interface{}{
			"id":             fmt.Sprintf("id-%d", i),
			"semanticScore":  0.6,
			"keywordScore":   0.4,
			"combinedScore":  0.5,
			"channelScores":  map[string]float64{"semantic": 0.6},
			"tokenMatches":   []interface{}{},
			"channels":       []string{"semantic"},
			"preRerankScore": 0.5,
			"finalScore":     0.5,
			"labels":         []string{},
			"scope":          "global",
			"shortcut":       "x",
			"detail":         "y",
		}
	}
	b, _ := json.Marshal(map[string]interface{}{
		"entries":       entries,
		"queryTokens":   []string{"x", "y"},
		"maxCandidates": 50,
	})
	return b
}

func dedupFingerprintPayload() []byte {
	b, _ := json.Marshal(map[string]interface{}{"parts": []string{"hello", "world", "trap"}})
	return b
}

func mixedPayload(readN, writeN int) []byte {
	// mixed helper not used as single payload; mixed run does per-iteration routing
	return nil
}

func geneDerivePayload(n int) []byte {
	traps := make([]map[string]interface{}, n)
	for i := 0; i < n; i++ {
		traps[i] = map[string]interface{}{
			"trapId":           fmt.Sprintf("t-%d", i),
			"trapText":         "MATCH: foo\nGOAL: bar\nSTRATEGY: fix\nAVOID: bad\nVERIFY: test",
			"derivationUnitId": fmt.Sprintf("u-%d", i),
		}
	}
	b, _ := json.Marshal(map[string]interface{}{"traps": traps})
	return b
}

func runScenario(sc Scenario) Result {
	if sc.Name == "mixed-50-1" {
		return runMixedScenario(sc)
	}
	start := time.Now()
	deadline := start.Add(sc.Duration)
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        sc.VUs * 2,
			MaxIdleConnsPerHost: sc.VUs * 2,
			IdleConnTimeout:     30 * time.Second,
		},
	}

	var (
		mu        sync.Mutex
		lats      []float64
		total     int64
		success   int64
		fail      int64
	)

	var wg sync.WaitGroup
	for i := 0; i < sc.VUs; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localLats := make([]float64, 0, 128)
			for time.Now().Before(deadline) {
				t0 := time.Now()
				req, _ := http.NewRequest("POST", sc.URLPath, bytes.NewReader(sc.Payload))
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				lat := time.Since(t0).Seconds() * 1000
				atomic.AddInt64(&total, 1)
				localLats = append(localLats, lat)
				if err != nil {
					atomic.AddInt64(&fail, 1)
					continue
				}
				// drain
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
				if resp.StatusCode != 200 {
					atomic.AddInt64(&fail, 1)
				} else {
					atomic.AddInt64(&success, 1)
				}
			}
			mu.Lock()
			lats = append(lats, localLats...)
			mu.Unlock()
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)

	// sort and compute percentiles
	sort.Float64s(lats)
	n := len(lats)
	var p50, p95, p99, min, max, avg float64
	if n > 0 {
		min = lats[0]
		max = lats[n-1]
		var sum float64
		for _, v := range lats { sum += v }
		avg = sum / float64(n)
		p50 = percentile(lats, 50)
		p95 = percentile(lats, 95)
		p99 = percentile(lats, 99)
	}
	failRate := 0.0
	if total > 0 {
		failRate = float64(fail) / float64(total)
	}
	rps := float64(total) / elapsed.Seconds()
	pass := p95 <= sc.Thresholds.P95Ms && p99 <= sc.Thresholds.P99Ms && failRate <= sc.Thresholds.MaxFailRate
	// if no p99 threshold, just check p95
	if sc.Thresholds.P99Ms == 0 {
		pass = p95 <= sc.Thresholds.P95Ms && failRate <= sc.Thresholds.MaxFailRate
	}
	msg := ""
	if !pass {
		msg = fmt.Sprintf("threshold miss: p95 %.2f > %.0f or p99 %.2f > %.0f or fail %.2f%%", p95, sc.Thresholds.P95Ms, p99, sc.Thresholds.P99Ms, failRate*100)
	}
	return Result{
		Scenario: sc.Name, URL: sc.URLPath, VUs: sc.VUs, DurationMs: int64(sc.Duration / time.Millisecond),
		TotalReqs: total, SuccessReqs: success, FailReqs: fail, FailRate: failRate, RPS: rps,
		P50Ms: p50, P95Ms: p95, P99Ms: p99, MinMs: min, MaxMs: max, AvgMs: avg,
		ThresholdPass: pass, Message: msg,
	}
}

func runMixedScenario(sc Scenario) Result {
	// 50 reads (batch-cosine + ranking-batch) per 1 write (dedup or gene-derive)
	// Use baseURL from sc.URLPath which is "/mixed-50-1" — extract base
	base := ""
	if idx := len(sc.URLPath) - len("/mixed-50-1"); idx > 0 {
		base = sc.URLPath[:idx]
	}
	if base == "" {
		base = "http://localhost:4100"
	}
	// Pre-generate payloads
	rBatchCosine := batchCosinePayload(1000, 384)
	rRanking := rankingBatchPayload(1000)
	wDedup := dedupFingerprintPayload()
	wGene := geneDerivePayload(200)
	readPayloads := [][]byte{rBatchCosine, rRanking}
	readPaths := []string{base + "/v1/vector/batch-cosine", base + "/v1/retrieval/ranking-batch"}
	writePayloads := [][]byte{wDedup, wGene}
	writePaths := []string{base + "/v1/dedup/fingerprint", base + "/v1/gene/derive-batch"}
	start := time.Now()
	deadline := start.Add(sc.Duration)
	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{MaxIdleConns: sc.VUs * 2, MaxIdleConnsPerHost: sc.VUs * 2, IdleConnTimeout: 30 * time.Second}}
	var mu sync.Mutex
	var lats []float64
	var total, success, fail int64
	var wg sync.WaitGroup
	var reqCounter int64
	for i := 0; i < sc.VUs; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := make([]float64, 0, 128)
			for time.Now().Before(deadline) {
				n := atomic.AddInt64(&reqCounter, 1)
				isWrite := n%51 == 0 // 50 reads then 1 write
				var url string
				var payload []byte
				if isWrite {
					wIdx := int((n/51)%int64(len(writePayloads)))
					url = writePaths[wIdx]
					payload = writePayloads[wIdx]
				} else {
					rIdx := int(n % int64(len(readPayloads)))
					url = readPaths[rIdx]
					payload = readPayloads[rIdx]
				}
				t0 := time.Now()
				req, _ := http.NewRequest("POST", url, bytes.NewReader(payload))
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				lat := time.Since(t0).Seconds() * 1000
				atomic.AddInt64(&total, 1)
				local = append(local, lat)
				if err != nil {
					atomic.AddInt64(&fail, 1)
					continue
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
				if resp.StatusCode != 200 {
					atomic.AddInt64(&fail, 1)
				} else {
					atomic.AddInt64(&success, 1)
				}
			}
			mu.Lock()
			lats = append(lats, local...)
			mu.Unlock()
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)
	sort.Float64s(lats)
	n := len(lats)
	var p50, p95, p99, min, max, avg float64
	if n > 0 {
		min = lats[0]
		max = lats[n-1]
		var sum float64
		for _, v := range lats {
			sum += v
		}
		avg = sum / float64(n)
		p50 = percentile(lats, 50)
		p95 = percentile(lats, 95)
		p99 = percentile(lats, 99)
	}
	failRate := 0.0
	if total > 0 {
		failRate = float64(fail) / float64(total)
	}
	rps := float64(total) / elapsed.Seconds()
	pass := p95 <= sc.Thresholds.P95Ms && p99 <= sc.Thresholds.P99Ms && failRate <= sc.Thresholds.MaxFailRate
	if sc.Thresholds.P99Ms == 0 {
		pass = p95 <= sc.Thresholds.P95Ms && failRate <= sc.Thresholds.MaxFailRate
	}
	msg := ""
	if !pass {
		msg = fmt.Sprintf("threshold miss: p95 %.2f > %.0f or p99 %.2f > %.0f or fail %.2f%%", p95, sc.Thresholds.P95Ms, p99, sc.Thresholds.P99Ms, failRate*100)
	}
	return Result{Scenario: sc.Name, URL: base + "/mixed-50-1 (50:1 reads:writes)", VUs: sc.VUs, DurationMs: int64(sc.Duration / time.Millisecond), TotalReqs: total, SuccessReqs: success, FailReqs: fail, FailRate: failRate, RPS: rps, P50Ms: p50, P95Ms: p95, P99Ms: p99, MinMs: min, MaxMs: max, AvgMs: avg, ThresholdPass: pass, Message: msg}
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 { return 0 }
	idx := int(float64(len(sorted)) * p / 100.0)
	if idx >= len(sorted) { idx = len(sorted)-1 }
	return sorted[idx]
}

func printResult(r Result) {
	fmt.Printf("  total=%d success=%d fail=%d failRate=%.2f%% rps=%.1f\n", r.TotalReqs, r.SuccessReqs, r.FailReqs, r.FailRate*100, r.RPS)
	fmt.Printf("  p50=%.2fms p95=%.2fms p99=%.2fms min=%.2f max=%.2f avg=%.2f\n", r.P50Ms, r.P95Ms, r.P99Ms, r.MinMs, r.MaxMs, r.AvgMs)
	fmt.Printf("  threshold: %v %s\n", r.ThresholdPass, r.Message)
}

func writeJSON(path string, v interface{}) error {
	// Resolve relative to repo root (find package.json)
	resolved := path
	if !filepath.IsAbs(path) {
		cwd, _ := os.Getwd()
		dir := cwd
		for i := 0; i < 6; i++ {
			if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
				resolved = filepath.Join(dir, path)
				break
			}
			dir = filepath.Dir(dir)
		}
	}
	_ = os.MkdirAll(filepath.Dir(resolved), 0755)
	b, _ := json.MarshalIndent(v, "", "  ")
	return os.WriteFile(resolved, b, 0644)
}

func httpGet(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil { return nil, err }
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	return buf.Bytes(), nil
}

func resolveResultsDir() string {
	cwd, _ := os.Getwd()
	dir := cwd
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return filepath.Join(dir, "benchmarks/results")
		}
		dir = filepath.Dir(dir)
	}
	return "benchmarks/results"
}

func firstLines(s string, n int) string {
	lines := bytes.Split([]byte(s), []byte("\n"))
	if len(lines) > n { lines = lines[:n] }
	return string(bytes.Join(lines, []byte("\n")))
}

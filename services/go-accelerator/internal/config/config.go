package config

import (
	"os"
	"strconv"
)

type Config struct {
	CacheSize      int
	Port           string
	LogLevel       string
	ReadTimeoutMs  int
	WriteTimeoutMs int
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("TRAPMAP_GO_ACCELERATOR_PORT")
	}
	if port == "" {
		port = "4100"
	}
	lvl := os.Getenv("TRAPMAP_LOG_LEVEL")
	if lvl == "" {
		lvl = "info"
	}
	return Config{
		CacheSize:      getIntEnv("TRAPMAP_GO_ACCEL_CACHE_SIZE", 10000),
		Port:           port,
		LogLevel:       lvl,
		ReadTimeoutMs:  getIntEnv("TRAPMAP_GO_ACCELERATOR_READ_TIMEOUT_MS", 10000),
		WriteTimeoutMs: getIntEnv("TRAPMAP_GO_ACCELERATOR_WRITE_TIMEOUT_MS", 10000),
	}
}

func getIntEnv(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

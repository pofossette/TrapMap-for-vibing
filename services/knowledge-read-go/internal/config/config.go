package config

import "github.com/kelseyhightower/envconfig"

type Config struct {
	Port         string `envconfig:"PORT" default:"4101"`
	ReadImpl     string `envconfig:"TRAPMAP_READ_IMPL" default:"off"`
	DatabaseURL  string `envconfig:"DATABASE_URL" default:"postgres://postgres:postgres@localhost:5432/trapmap"`
	CacheSize    int    `envconfig:"TRAPMAP_GO_ACCEL_CACHE_SIZE" default:"10000"`
	LogLevel     string `envconfig:"TRAPMAP_LOG_LEVEL" default:"info"`
	ReadTimeoutMs int   `envconfig:"TRAPMAP_READ_TIMEOUT_MS" default:"8000"`
	WriteTimeoutMs int  `envconfig:"TRAPMAP_READ_WRITE_TIMEOUT_MS" default:"8000"`
	GoAccelURL   string `envconfig:"TRAPMAP_GO_ACCELERATOR_URL" default:"http://go-accelerator:4100"`
}

func Load() Config {
	var c Config
	_ = envconfig.Process("", &c)
	if c.Port == "" {
		c.Port = "4101"
	}
	if c.ReadImpl == "" {
		c.ReadImpl = "off"
	}
	if c.CacheSize <= 0 {
		c.CacheSize = 10000
	}
	return c
}

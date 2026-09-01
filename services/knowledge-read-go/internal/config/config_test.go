package config_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
	"trapmap-knowledge-read-go/internal/config"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("TRAPMAP_READ_IMPL")
	os.Unsetenv("DATABASE_URL")
	cfg := config.Load()
	require.Equal(t, "4101", cfg.Port)
	require.Equal(t, "off", cfg.ReadImpl)
	require.Contains(t, cfg.DatabaseURL, "postgres")
	require.Equal(t, 10000, cfg.CacheSize)
}

func TestLoad_EnvOverride(t *testing.T) {
	os.Setenv("PORT", "9999")
	os.Setenv("TRAPMAP_READ_IMPL", "shadow")
	defer func(){ os.Unsetenv("PORT"); os.Unsetenv("TRAPMAP_READ_IMPL") }()
	cfg := config.Load()
	require.Equal(t, "9999", cfg.Port)
	require.Equal(t, "shadow", cfg.ReadImpl)
}

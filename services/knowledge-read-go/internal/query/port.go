package query

import "context"

type Port interface {
	Plan(ctx context.Context, query string) (tokens []string, vector []float64, err error)
}

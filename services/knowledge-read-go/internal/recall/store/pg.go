package store

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	ID       string
	Scope    string
	Labels   []string
	Shortcut string
	Detail   string
	Vector   []float64
}

type PG struct {
	pool *pgxpool.Pool
}

func NewPG(pool *pgxpool.Pool) *PG { return &PG{pool: pool} }

func BuildQuery(filter string) string {
	// pure SELECT builder used for test guard — never generate INSERT/UPDATE/DELETE
	base := "SELECT id, scope, labels, shortcut, detail, embedding FROM knowledge_entries WHERE 1=1"
	if strings.TrimSpace(filter) != "" {
		base += " AND shortcut ILIKE '%" + filter + "%'"
	}
	base += " LIMIT 100"
	return base
}

func (p *PG) Read(ctx context.Context, limit int) ([]Entry, error) {
	if p.pool == nil {
		return []Entry{}, nil
	}
	if limit <= 0 {
		limit = 50
	}
	rows, err := p.pool.Query(ctx, "SELECT id, scope, labels, shortcut, detail FROM knowledge_entries LIMIT $1", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Entry
	for rows.Next() {
		var e Entry
		var labels []string
		if err := rows.Scan(&e.ID, &e.Scope, &labels, &e.Shortcut, &e.Detail); err != nil {
			return nil, err
		}
		e.Labels = labels
		out = append(out, e)
	}
	return out, rows.Err()
}

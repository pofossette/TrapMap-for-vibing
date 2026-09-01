package assembly

import (
	"context"
	"trapmap-knowledge-read-go/internal/assembly/domain"
	"trapmap-knowledge-read-go/internal/assembly/service"
)

type Port interface {
	Assemble(ctx context.Context, entries []domain.Entry) (service.Response, error)
}

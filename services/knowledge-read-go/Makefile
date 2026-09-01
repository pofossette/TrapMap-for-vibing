build:
	go build -o bin/server ./cmd/server
test:
	go test ./... -count=1
vet:
	go vet ./...
run:
	go run ./cmd/server
docker:
	docker build -t trapmap-knowledge-read-go:latest .

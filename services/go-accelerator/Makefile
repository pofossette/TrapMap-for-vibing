build:
	go build -o bin/server ./cmd/server

test:
	go test ./... -count=1

run:
	go run ./cmd/server

docker:
	docker build -t trapmap-go-accelerator:latest .

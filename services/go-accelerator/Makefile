build:
	go build -o bin/server ./cmd/server

test:
	go test ./... -count=1

run:
	go run ./cmd/server

docker:
	docker build -t trapmap-go-accelerator:latest .

stress:
	go run ./cmd/stress -scenario all

stress-batch-cosine:
	go run ./cmd/stress -scenario batch-cosine

stress-ranking:
	go run ./cmd/stress -scenario ranking-batch

stress-dedup:
	go run ./cmd/stress -scenario dedup-flood

stress-gene-derive:
	go run ./cmd/stress -scenario gene-derive

stress-build:
	go build -o bin/stress ./cmd/stress

FROM golang:1.22-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /go-accelerator ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=builder /go-accelerator /go-accelerator
EXPOSE 4100
ENV PORT=4100
ENTRYPOINT ["/go-accelerator"]

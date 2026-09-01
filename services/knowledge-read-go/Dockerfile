FROM golang:1.23-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
EXPOSE 4101
ENV PORT=4101
ENTRYPOINT ["/server"]

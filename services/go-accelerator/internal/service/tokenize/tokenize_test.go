package tokenize

import "testing"

func TestTokenize(t *testing.T) {
	tokens := Tokenize("Hello, World! 123")
	if len(tokens) != 3 {
		t.Fatalf("got %v", tokens)
	}
}

func TestChunk(t *testing.T) {
	text := "a b c d e f g h i j"
	chunks := Chunk(text, 3, 1)
	if len(chunks) == 0 {
		t.Fatalf("no chunks")
	}
}

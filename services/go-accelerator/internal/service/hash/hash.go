package hash

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

func CanonicalJSON(v interface{}) (string, error) {
	b, err := marshalCanonical(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func marshalCanonical(v interface{}) ([]byte, error) {
	switch val := v.(type) {
	case nil:
		return []byte("null"), nil
	case map[string]interface{}:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := []byte("{")
		for i, k := range keys {
			if i > 0 {
				out = append(out, ',')
			}
			kb, _ := json.Marshal(k)
			out = append(out, kb...)
			out = append(out, ':')
			vb, err := marshalCanonical(val[k])
			if err != nil {
				return nil, err
			}
			out = append(out, vb...)
		}
		out = append(out, '}')
		return out, nil
	case []interface{}:
		out := []byte("[")
		for i, e := range val {
			if i > 0 {
				out = append(out, ',')
			}
			b, err := marshalCanonical(e)
			if err != nil {
				return nil, err
			}
			out = append(out, b...)
		}
		out = append(out, ']')
		return out, nil
	default:
		return json.Marshal(v)
	}
}

func SHA256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func CanonicalHash(v interface{}) (canonical string, hash string, err error) {
	canonical, err = CanonicalJSON(v)
	if err != nil {
		return "", "", err
	}
	hash = SHA256Hex(canonical)
	return canonical, hash, nil
}

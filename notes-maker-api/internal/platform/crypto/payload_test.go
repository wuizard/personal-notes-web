package crypto

import (
	"bytes"
	"encoding/base64"
	"errors"
	"testing"
)

func testKey(b byte) []byte {
	key := make([]byte, KeySize)
	for i := range key {
		key[i] = b
	}
	return key
}

func newTestSealer(t *testing.T, keys map[int][]byte) *Sealer {
	t.Helper()
	s, err := NewSealer(keys)
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}
	return s
}

func TestSealOpenRoundTrips(t *testing.T) {
	s := newTestSealer(t, map[int][]byte{1: testKey(0x01)})
	plaintext := []byte(`{"title":"Groceries"}`)
	aad := []byte("user:note")

	sealed, version, err := s.Seal(plaintext, aad)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if version != 1 {
		t.Fatalf("expected key version 1, got %d", version)
	}
	if bytes.Contains(sealed, []byte("Groceries")) {
		t.Fatal("sealed payload still contains the plaintext")
	}

	opened, err := s.Open(sealed, aad, version)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if !bytes.Equal(opened, plaintext) {
		t.Fatalf("round trip changed the payload: %q", opened)
	}
}

// The nonce must be fresh per call, or two notes with identical content leak
// that they are identical.
func TestSealIsNonDeterministic(t *testing.T) {
	s := newTestSealer(t, map[int][]byte{1: testKey(0x01)})
	plaintext := []byte("same content")

	first, _, err := s.Seal(plaintext, nil)
	if err != nil {
		t.Fatalf("first Seal: %v", err)
	}
	second, _, err := s.Seal(plaintext, nil)
	if err != nil {
		t.Fatalf("second Seal: %v", err)
	}
	if bytes.Equal(first, second) {
		t.Fatal("sealing the same plaintext twice produced identical bytes")
	}
}

// A payload lifted from one note into another must not open — this is what
// stops a ciphertext being moved between notes, or between users.
func TestOpenRejectsMismatchedAAD(t *testing.T) {
	s := newTestSealer(t, map[int][]byte{1: testKey(0x01)})

	sealed, version, err := s.Seal([]byte("secret"), []byte("user-a:note-1"))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if _, err := s.Open(sealed, []byte("user-b:note-1"), version); err == nil {
		t.Fatal("expected Open to fail against a different note's aad")
	}
}

func TestOpenRejectsTamperedCiphertext(t *testing.T) {
	s := newTestSealer(t, map[int][]byte{1: testKey(0x01)})

	sealed, version, err := s.Seal([]byte("secret"), nil)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	sealed[len(sealed)-1] ^= 0xff

	if _, err := s.Open(sealed, nil, version); err == nil {
		t.Fatal("expected Open to reject a tampered payload")
	}
}

// Rotation: the highest version seals new writes, and older keys stay usable
// so documents written before the rotation still open.
func TestKeyRotationKeepsOldPayloadsReadable(t *testing.T) {
	old := newTestSealer(t, map[int][]byte{1: testKey(0x01)})
	sealedUnderV1, v1, err := old.Seal([]byte("written before rotation"), nil)
	if err != nil {
		t.Fatalf("Seal under v1: %v", err)
	}

	rotated := newTestSealer(t, map[int][]byte{1: testKey(0x01), 2: testKey(0x02)})
	if rotated.PrimaryVersion() != 2 {
		t.Fatalf("expected the highest version to be primary, got %d", rotated.PrimaryVersion())
	}

	opened, err := rotated.Open(sealedUnderV1, nil, v1)
	if err != nil {
		t.Fatalf("open a v1 payload after rotating to v2: %v", err)
	}
	if string(opened) != "written before rotation" {
		t.Fatalf("unexpected plaintext %q", opened)
	}

	_, version, err := rotated.Seal([]byte("written after rotation"), nil)
	if err != nil {
		t.Fatalf("Seal after rotation: %v", err)
	}
	if version != 2 {
		t.Fatalf("expected new writes to use v2, got v%d", version)
	}
}

// Dropping a key from the keyring makes its documents unreadable, so the
// failure has to be identifiable rather than looking like corruption.
func TestOpenWithMissingKeyVersionIsIdentifiable(t *testing.T) {
	s := newTestSealer(t, map[int][]byte{1: testKey(0x01)})
	sealed, _, err := s.Seal([]byte("x"), nil)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if _, err := s.Open(sealed, nil, 9); !errors.Is(err, ErrUnknownKeyVersion) {
		t.Fatalf("expected ErrUnknownKeyVersion, got %v", err)
	}
}

func TestNewSealerRejectsWrongKeyLength(t *testing.T) {
	if _, err := NewSealer(map[int][]byte{1: []byte("too short")}); err == nil {
		t.Fatal("expected a key that is not 32 bytes to be rejected")
	}
}

func TestParseKeyring(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString(testKey(0x01))

	t.Run("bare key is version 1", func(t *testing.T) {
		keys, err := ParseKeyring(encoded)
		if err != nil {
			t.Fatalf("ParseKeyring: %v", err)
		}
		if len(keys) != 1 || !bytes.Equal(keys[1], testKey(0x01)) {
			t.Fatalf("unexpected keyring %v", keys)
		}
	})

	t.Run("versioned entries", func(t *testing.T) {
		spec := "1:" + encoded + ",2:" + base64.StdEncoding.EncodeToString(testKey(0x02))
		keys, err := ParseKeyring(spec)
		if err != nil {
			t.Fatalf("ParseKeyring: %v", err)
		}
		if len(keys) != 2 || !bytes.Equal(keys[2], testKey(0x02)) {
			t.Fatalf("unexpected keyring %v", keys)
		}
	})

	t.Run("duplicate version is rejected", func(t *testing.T) {
		if _, err := ParseKeyring("1:" + encoded + ",1:" + encoded); err == nil {
			t.Fatal("expected a duplicate key version to be rejected")
		}
	})

	t.Run("empty spec is rejected", func(t *testing.T) {
		if _, err := ParseKeyring("  "); err == nil {
			t.Fatal("expected an empty spec to be rejected")
		}
	})
}

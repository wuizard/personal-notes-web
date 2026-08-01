// Package crypto seals note content at rest.
//
// Note content — title, body, the plaintext search mirror, checklist items —
// is stored as one opaque blob rather than as readable fields. Two reasons,
// in this order:
//
//  1. A stolen database dump is useless without the key, which lives in the
//     process environment and never in Mongo.
//  2. It is the seam for end-to-end encryption. A future E2E client seals
//     content itself and hands the server ciphertext; the server stores what
//     it is given and simply stops calling Seal. The document shape does not
//     change on that day — only who holds the key.
//
// The cost, accepted deliberately: the server cannot read or search sealed
// content. Search stays local to the client over Dexie (docs/04, docs/08).
// Field-level conflict merge still works *today* because the server holds the
// key and can open the blob; that is what breaks under real E2E.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// ErrUnknownKeyVersion means a document was sealed with a key this process
// was not given. Rotating a key without keeping the old one in the keyring
// makes every document sealed under it permanently unreadable, so this is
// surfaced loudly rather than treated as a decode failure.
var ErrUnknownKeyVersion = errors.New("crypto: no key for that version")

// KeySize is the AES-256 key length. Anything else is rejected at boot
// rather than silently downgrading to AES-128.
const KeySize = 32

// Sealer seals and opens note payloads with AES-256-GCM.
//
// It holds a keyring rather than a single key: rotation means adding a new,
// higher-numbered key that becomes primary for new writes, while old keys
// stay available to open documents already written under them. Documents are
// re-sealed lazily, on their next update.
type Sealer struct {
	keys    map[int]cipher.AEAD
	primary int
}

// NewSealer builds a Sealer from a version→key map. The highest version
// present becomes the primary — the one new writes are sealed with — so
// rotation is "add a key with a bigger number" and nothing else.
func NewSealer(keys map[int][]byte) (*Sealer, error) {
	if len(keys) == 0 {
		return nil, errors.New("crypto: keyring is empty")
	}

	s := &Sealer{keys: make(map[int]cipher.AEAD, len(keys))}
	for version, key := range keys {
		if version < 1 {
			return nil, fmt.Errorf("crypto: key version must be >= 1, got %d", version)
		}
		if len(key) != KeySize {
			return nil, fmt.Errorf("crypto: key v%d is %d bytes, want %d", version, len(key), KeySize)
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, fmt.Errorf("crypto: key v%d: %w", version, err)
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, fmt.Errorf("crypto: key v%d: %w", version, err)
		}
		s.keys[version] = aead
		if version > s.primary {
			s.primary = version
		}
	}
	return s, nil
}

// PrimaryVersion is the key version new writes are sealed with. Callers store
// it alongside the payload so Open knows which key to reach for.
func (s *Sealer) PrimaryVersion() int { return s.primary }

// Seal encrypts plaintext under the primary key, returning nonce||ciphertext
// and the key version used.
//
// aad binds the payload to the document it belongs to (see note.payloadAAD):
// a ciphertext lifted out of one note and pasted into another — or into
// another user's note — fails to open rather than silently decrypting.
func (s *Sealer) Seal(plaintext, aad []byte) (sealed []byte, version int, err error) {
	aead := s.keys[s.primary]
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, 0, fmt.Errorf("crypto: nonce: %w", err)
	}
	return aead.Seal(nonce, nonce, plaintext, aad), s.primary, nil
}

// Open decrypts a payload sealed under the given key version. It fails if the
// ciphertext, the aad, or the key is wrong — GCM authenticates all three.
func (s *Sealer) Open(sealed, aad []byte, version int) ([]byte, error) {
	aead, ok := s.keys[version]
	if !ok {
		return nil, fmt.Errorf("%w: v%d", ErrUnknownKeyVersion, version)
	}
	if len(sealed) < aead.NonceSize() {
		return nil, errors.New("crypto: payload shorter than its nonce")
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	plaintext, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, fmt.Errorf("crypto: open: %w", err)
	}
	return plaintext, nil
}

// ParseKeyring reads the NOTES_ENCRYPTION_KEY format: comma-separated
// "<version>:<standard-base64 of 32 bytes>" entries, e.g.
//
//	1:aGVsbG8...,2:d29ybGQ...
//
// A bare base64 key with no version prefix is read as version 1, which is
// what a first deployment will have.
func ParseKeyring(spec string) (map[int][]byte, error) {
	keys := map[int][]byte{}
	for _, entry := range strings.Split(spec, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		version := 1
		encoded := entry
		if prefix, rest, ok := strings.Cut(entry, ":"); ok {
			parsed, err := strconv.Atoi(prefix)
			if err != nil {
				return nil, fmt.Errorf("crypto: key version %q is not a number", prefix)
			}
			version, encoded = parsed, rest
		}

		key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
		if err != nil {
			return nil, fmt.Errorf("crypto: key v%d is not valid base64: %w", version, err)
		}
		if _, duplicate := keys[version]; duplicate {
			return nil, fmt.Errorf("crypto: key version %d appears twice", version)
		}
		keys[version] = key
	}
	if len(keys) == 0 {
		return nil, errors.New("crypto: no keys in spec")
	}
	return keys, nil
}

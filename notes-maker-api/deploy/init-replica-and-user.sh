#!/usr/bin/env bash
# One-time bootstrap for the production Mongo container: initiates the
# single-node replica set, then creates the app's database user — both while
# the "localhost exception" is still open (no user exists yet, so an
# unauthenticated connection from inside the container is allowed).
#
# Must run via `docker compose exec`, not a plain `mongosh` from the host or
# over the "mongo" hostname — the localhost exception only recognizes a
# connection that is actually loopback from mongod's point of view, which
# `docker compose exec` gives you and a bridge-network hostname does not.
#
# Run once, right after the FIRST `docker compose up -d mongo`. Safe to
# re-run within that same bootstrap window (replica-set-already-initiated
# and user-already-exists are both handled). NOT safe to re-run in a later
# session once the localhost exception has actually closed for good — at
# that point an unauthenticated createUser fails with "not authorized"
# rather than "already exists", and that's surfaced as a real error rather
# than swallowed, on purpose.
set -euo pipefail

: "${MONGO_APP_USER:?set MONGO_APP_USER, e.g. notes_maker_app}"
: "${MONGO_APP_PASSWORD:?set MONGO_APP_PASSWORD to a generated secret}"

COMPOSE_FILE="$(dirname "$0")/docker-compose.mongo.yml"

echo "==> Waiting for mongod to accept connections..."
until docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
  sleep 1
done

# The member is registered as 127.0.0.1, not the "mongo" Compose service
# name: whatever host is registered here is what a driver routes ALL real
# traffic to once it learns the replica set topology, regardless of what
# address it originally dialed. The Go API runs bare via systemd on the
# host, outside the Compose network, so "mongo" resolves for another
# container but not for it. 127.0.0.1:27017 resolves correctly both from
# inside this container (its own loopback) and from the host (via the
# published port) — no apostrophes in this comment, deliberately: it's
# interpolated inside a single-quoted bash string below, and one earlier
# broke the quoting and mangled the script it was documenting.
echo "==> Initiating replica set (no-op if already initiated)..."
docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval '
  try {
    rs.status();
    print("replica set already initiated");
  } catch (e) {
    rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] });
    print("replica set initiated");
  }
'

echo "==> Waiting for a primary to be elected..."
until docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q true; do
  sleep 1
done

# A pre-check via countDocuments()/aggregate against system.users is NOT
# covered by the localhost exception (only a narrow set of user-management
# commands, createUser among them, is) — checking existence first gets
# "not authorized" before createUser is ever attempted, even on a genuinely
# fresh, no-users-yet deployment. Attempt createUser directly instead and
# catch the specific duplicate-user error for the idempotent-rerun case.
echo "==> Creating scoped app user on notes_maker (no-op if it already exists)..."
docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "
  try {
    db.getSiblingDB('notes_maker').createUser({
      user: '${MONGO_APP_USER}',
      pwd: '${MONGO_APP_PASSWORD}',
      roles: [{ role: 'readWrite', db: 'notes_maker' }],
    });
    print('user ${MONGO_APP_USER} created');
  } catch (e) {
    if (e.codeName === 'Location51003' || /already exists/.test(e.message)) {
      print('user ${MONGO_APP_USER} already exists');
    } else {
      throw e;
    }
  }
"

echo "==> Done. MONGO_URI for the API:"
echo "mongodb://${MONGO_APP_USER}:<password>@127.0.0.1:27017/notes_maker?replicaSet=rs0&authSource=notes_maker"

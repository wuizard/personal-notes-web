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
# Run once, right after the FIRST `docker compose up -d mongo`. Re-running is
# safe: each step checks whether it already happened.
set -euo pipefail

: "${MONGO_APP_USER:?set MONGO_APP_USER, e.g. notes_maker_app}"
: "${MONGO_APP_PASSWORD:?set MONGO_APP_PASSWORD to a generated secret}"

COMPOSE_FILE="$(dirname "$0")/docker-compose.mongo.yml"

echo "==> Waiting for mongod to accept connections..."
until docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
  sleep 1
done

echo "==> Initiating replica set (no-op if already initiated)..."
docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval '
  try {
    rs.status();
    print("replica set already initiated");
  } catch (e) {
    rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] });
    print("replica set initiated");
  }
'

echo "==> Waiting for a primary to be elected..."
until docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q true; do
  sleep 1
done

echo "==> Creating scoped app user on notes_maker (no-op if it already exists)..."
docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --quiet --eval "
  const admin = db.getSiblingDB('admin');
  const existing = admin.system.users.countDocuments({ user: '${MONGO_APP_USER}' });
  if (existing > 0) {
    print('user ${MONGO_APP_USER} already exists');
  } else {
    db.getSiblingDB('notes_maker').createUser({
      user: '${MONGO_APP_USER}',
      pwd: '${MONGO_APP_PASSWORD}',
      roles: [{ role: 'readWrite', db: 'notes_maker' }],
    });
    print('user ${MONGO_APP_USER} created');
  }
"

echo "==> Done. MONGO_URI for the API:"
echo "mongodb://${MONGO_APP_USER}:<password>@127.0.0.1:27017/notes_maker?replicaSet=rs0&authSource=notes_maker"

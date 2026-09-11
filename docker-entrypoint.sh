#!/bin/sh
#
# Runs on every container start, before the server accepts traffic.
#
# Applies any database migrations the running image expects, then hands
# over to the app. The point is that a deploy is one action — push, and
# the schema and the code move together — rather than a deploy followed
# by someone remembering to open a terminal.
#
# Why this is safe to run automatically:
#
#   * `prisma migrate deploy` only ever applies migrations that have not
#     been applied yet, in order. It never generates, never resets, and
#     never drops anything. On a database that is already up to date it
#     is a no-op. It is the command Prisma documents for exactly this.
#
#   * It is NOT `migrate dev`, which can reset a database, and NOT
#     `db push`, which infers changes and can drop columns. Neither
#     belongs anywhere near production, and neither is used here.
#
#   * A failed migration stops the container. That is deliberate: the
#     alternative is an app serving traffic against a schema it does not
#     match, which corrupts data quietly instead of failing loudly.
#     Coolify keeps the previous container running until the new one is
#     healthy, so a failure here leaves the old version serving.
#
# A migration that is itself destructive (dropping a column) is still
# destructive — this only guarantees that migrations are applied
# predictably, not that every migration is safe to write.

set -e

echo "[deploy] Applying database migrations…"

# Retry briefly: Postgres and the app often start together, and the
# database may not be accepting connections for the first second or two.
attempt=1
max_attempts=10

until npx --no-install prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[deploy] Migrations failed after ${max_attempts} attempts. Refusing to start."
    echo "[deploy] The previous version keeps serving; check DATABASE_URL and the log above."
    exit 1
  fi

  echo "[deploy] Attempt ${attempt}/${max_attempts} failed; retrying in 3s…"
  attempt=$((attempt + 1))
  sleep 3
done

echo "[deploy] Migrations up to date."
echo "[deploy] Starting ${APP_VERSION:-app}…"

# exec, so the server becomes PID 1 and receives SIGTERM directly.
# Without it the shell would swallow the signal and the container would
# be killed mid-request instead of draining.
exec "$@"

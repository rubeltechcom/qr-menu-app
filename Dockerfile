# syntax=docker/dockerfile:1

# Build image for Coolify (or any Docker host).
#
# Three stages so the runtime image carries neither the toolchain nor the
# dev dependencies: install, build, then a slim runner around Next's
# standalone output.

# --- Dependencies ---------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's engines need this on Alpine.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` runs the prepare script, which generates the Prisma client.
RUN npm ci

# --- Build ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build validates src/lib/env.ts, so give it placeholders. Real values
# are injected at runtime; nothing here is baked into the image.
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_URL=http://localhost:3000
ENV APP_DOMAIN=localhost
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV REDIS_URL=redis://localhost:6379
ENV AUTH_SECRET=build-time-placeholder-value-not-used-at-runtime

RUN npx prisma generate && npm run build

# --- Runtime --------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Where uploaded dish photos are written.
#
# THIS MUST BE A MOUNTED VOLUME. In Coolify: Persistent Storage → add a
# volume named e.g. qrmenu-uploads with the destination /data/uploads.
# Without one, the directory lives in the container's writable layer and
# every redeploy silently destroys every photo the restaurant uploaded —
# the database rows survive, so the menu simply renders broken images.
#
# The volume is created root-owned by Docker, so ownership is set here,
# before dropping to the unprivileged user, or the first upload fails
# with EACCES. src/instrumentation.ts checks this at boot.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Maintenance scripts run from the container's own terminal: creating
# the platform superadmin on a fresh install, and sweeping orphaned
# uploads. Without these the only way to make the first admin account
# would be editing the database by hand.
#
# package.json is NOT copied — the standalone output writes its own,
# carrying every npm script, and overwriting it would replace the file
# the server itself depends on.
COPY --from=builder --chown=node:node /app/scripts ./scripts

# The Prisma CLI, which the standalone output prunes — it ships the
# client, not the tooling. Needed because migrations are applied by the
# entrypoint on every start, so a deploy is one action rather than a
# deploy plus a remembered terminal command.
#
# The whole dependency tree, not a hand-picked subset. Copying just
# `prisma`, `@prisma` and the `.bin` shim looks tidier and does not
# work: the CLI reaches outside those three paths at runtime, and the
# failure is a crash loop on boot rather than anything a build catches.
#
#   * node_modules/.bin/prisma is a symlink to ../prisma/build/index.js.
#     COPY follows symlinks, so naming it directly wrote a 2.8 MB *copy*
#     into .bin/ — severed from the package directory it resolves
#     against. It reads prisma_schema_build_bg.wasm relative to itself,
#     so every `migrate deploy` died with ENOENT on that wasm.
#
#   * Deleting that file and calling prisma/build/index.js directly
#     only moves the failure: the CLI requires `effect` by way of
#     @prisma/config, and further transitive packages behind it, none
#     of which live under prisma/ or @prisma/.
#
# This is the full `npm ci` tree, devDependencies included, so it costs
# image size — the trade is migrations that actually run. The standalone
# output keeps its own traced copy of what the *server* needs; this
# layer lands on top of it and is a superset, so the server is unharmed.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# The version this image was built from, so a running container can say
# which deploy it is. Written AFTER the standalone output is copied,
# because that copy writes into /app and would otherwise clobber it.
#
# Taken from package.json at build time rather than a --build-arg:
# Coolify does not pass build args, so an ARG-based version always fell
# back to its default and every container reported "unknown".
RUN node -p "require('./package.json').version" > /app/.version \
  && chown node:node /app/.version

COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node
VOLUME ["/data/uploads"]
EXPOSE 3000

# Migrations run first; the server only starts if they succeed.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

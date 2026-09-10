# Deploying to Coolify from GitHub

Step by step, from a fresh server to a working QR menu.

Assumes you already have Coolify installed and a domain pointing at the
server. Everything here is done once; after that, deploying is a
`git push`.

---

## 0. What you need first

| | |
|---|---|
| A server | 2 GB RAM minimum, 4 GB comfortable. Ubuntu 22.04+ |
| Coolify | Installed and reachable at `https://coolify.yourdomain.com` |
| A domain | e.g. `menu.example.com`, with DNS pointing at the server |
| This repo | Pushed to GitHub (see §1) |

> **A wildcard DNS record is worth adding now.** Restaurants get
> subdomains (`joespizza.example.com`), so point `*.example.com` at the
> server as well as the bare domain.

---

## 1. Push the code to GitHub

If the repo is not on GitHub yet:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Nothing secret is committed — `.env*` files are gitignored, and only
`.env.example` (which holds names, not values) is tracked. Uploaded
photos are ignored too, via `/var/`.

---

## 2. Create the database and Redis in Coolify

Both live alongside the app, on the same server.

1. **Project → New → Database → PostgreSQL 16.**
   Name it `qrmenu-db`. Coolify generates the password.
   Copy the **internal** connection URL it shows — the one with the
   container hostname, not `localhost`.

2. **Project → New → Database → Redis.**
   Name it `qrmenu-redis`. Copy its internal URL too.

Redis carries realtime order events between processes. On a single
container the app falls back to in-process delivery if Redis is
unreachable, so a blip does not stop service — but do not run without it
in production.

---

## 3. Create the application

1. **Project → New → Application → Public/Private Repository.**
2. Point it at your GitHub repo, branch `main`.
3. **Build Pack: Dockerfile.** The repo has one at the root; Coolify
   will find it. Do not use Nixpacks — the Dockerfile handles Prisma
   generation and the standalone output correctly.
4. **Port: 3000.**
5. **Domain:** `https://menu.example.com` (plus `https://*.example.com`
   if you added the wildcard). Coolify issues the TLS certificate.

---

## 4. Add the persistent volume — do not skip this

**This is the single most important step.** Uploaded dish photos are
written to disk. Without a mounted volume they live inside the
container, and **every redeploy silently destroys all of them** — the
database rows survive, so the menu just renders broken images, and you
may not notice for weeks.

**Storages → Add → Volume Mount:**

| Field | Value |
|---|---|
| Name | `qrmenu-uploads` |
| Destination path | `/data/uploads` |

That is it. The Dockerfile already creates the directory with the right
ownership, and the app checks at startup that it is writable — if it is
not, the container fails immediately with a message naming the fix
rather than erroring on the first upload.

> **Back this volume up alongside Postgres.** A database-only restore
> gives you a menu of broken images.

---

## 5. Environment variables

**Environment Variables → paste these**, filling in your own values.
Names must match exactly; the app validates them at boot and refuses to
start if any required one is missing or malformed.

### Required

```
NODE_ENV=production
APP_URL=https://menu.example.com
APP_DOMAIN=example.com

DATABASE_URL=<internal Postgres URL from step 2>
REDIS_URL=<internal Redis URL from step 2>

AUTH_SECRET=<generate: openssl rand -base64 32>

UPLOAD_DIR=/data/uploads
```

`APP_DOMAIN` is the *root* domain used to build restaurant subdomains —
`example.com`, not `menu.example.com`.

### Optional

Leave any of these blank and the related feature simply stays off.

```
# Card payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
STRIPE_PRICE_SMART_MONTHLY=
STRIPE_PRICE_SMART_YEARLY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=

# bKash (Bangladesh)
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_SANDBOX=true

# Google sign-in for restaurant owners
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email
RESEND_API_KEY=
EMAIL_FROM=

# Object storage — only if you outgrow one server (see §9)
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
```

> `BKASH_SANDBOX` defaults to `true`. Set it to `false` only when you
> intend to move real money.

---

## 6. Deploy

Press **Deploy**. The first build takes a few minutes.

Watch the logs for:

```
[storage] Local disk ready (uploads)
```

If instead you see `Cannot write uploads to /data/uploads`, the volume
from step 4 is missing or misconfigured. Fix it and redeploy.

---

## 7. Run the database migrations

The app does not migrate on boot — that would be unsafe with more than
one container starting at once. Run it once by hand:

**Coolify → your app → Terminal (or Execute Command):**

```bash
npx prisma migrate deploy
```

You should see the migrations apply in order. Re-running is safe; it
skips anything already applied.

### Optional: demo data

To try it end to end before entering a real menu:

```bash
npm run db:seed:demo
```

That creates a demo restaurant, a small menu and six printable table QR
codes, and prints the login details. **Never run it on a live
install** — it deletes and recreates its own demo tenant by a fixed
email address.

---

## 8. Create your first real account

1. Open `https://menu.example.com`
2. **Create your free menu** → fill in the signup form
3. Add your location, build your menu, print the table QR codes
4. Staff sign in at `/staff/login` with the restaurant slug and a PIN

---

## 9. Afterwards

### Redeploying

Push to `main`. Coolify rebuilds and redeploys automatically if you
enabled auto-deploy; otherwise press **Deploy**. Your uploads and
database are untouched.

### New migrations

After a deploy that adds a migration, run `npx prisma migrate deploy`
again from the app terminal.

### Reclaiming orphaned photos

An upload that was never attached to a dish (someone closed the tab
mid-edit) lingers. Occasionally:

```bash
npm run storage:sweep -- --dry-run   # show what would go
npm run storage:sweep                # delete orphans over 24h old
```

### Moving to object storage

Only needed if you run more than one app container — a local volume
cannot be shared — or want a CDN in front of photos. Set `S3_BUCKET`,
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (plus `S3_ENDPOINT` for
R2/MinIO) and redeploy. New uploads go to the bucket; photos already on
disk keep working.

### Installing the app on a phone or tablet

The staff console is a PWA. On a kitchen tablet, open `/staff`, sign in,
and use **Install** on the prompt (Android/Chrome) or **Share → Add to
Home Screen** (iPhone/iPad). It then opens full screen, without the
address bar, and keeps working through brief wifi drops.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Container exits at startup | A required env var is missing or malformed — the log names it |
| `Cannot write uploads to …` | The volume from step 4 is missing |
| Photos vanished after a deploy | Same: the volume was never mounted |
| Menu loads but images are broken | Volume mounted *after* photos were uploaded; those files are gone |
| "No restaurant called …" at staff login | The slug is the one in the menu link, e.g. `demo-diner` |
| Orders do not appear live | Check `REDIS_URL`, and that the reverse proxy is not buffering `text/event-stream` |
| `relation does not exist` | Migrations have not been run — step 7 |

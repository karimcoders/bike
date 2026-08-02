# ▲ Vercel Deployment Guide — AI Bike Shop OS

> **Total time**: ~15 minutes (after pushing code to GitHub)
> **Monthly cost**: **₹0** (100% free, forever — within free tier limits)
> **Result**: A live website like `https://bike-shop-os.vercel.app` where you can log in, manage inventory, make sales, and print bills.

---

## 1. Overview — Why Vercel + Neon + Cloudinary?

This app is a **Next.js 16 + Prisma + PostgreSQL** application. To put it on the internet **for free**, we use **three services that work together**:

| Service | What it does | Why we picked it |
|---|---|---|
| **▲ Vercel** | Runs the website (frontend + API) | Built by the Next.js team — best Next.js hosting. Free **Hobby** tier. |
| **Neon** | Stores all data (products, sales, users) in **PostgreSQL** | Free tier with 0.5 GB storage — plenty for a bike shop. Always available (no cold starts). |
| **Cloudinary** | Stores uploaded images (product photos, logo, QR codes) | Free tier with 25 credits/month (~25 GB). Serves images via a fast global CDN. |

### Why three services instead of one?

Vercel is a **serverless** platform. That means two things:

1. ❌ **Vercel's filesystem is read-only** — you cannot save files (like images) on it.
2. ❌ **Vercel functions are stateless** — they don't keep a local database file.

So we split the storage out:
- **Database** → moved to **Neon** (a managed PostgreSQL in the cloud)
- **Images** → moved to **Cloudinary** (a cloud image store + CDN)

The app is already configured for this: it **auto-detects** Cloudinary if the env vars are set, and **always uses PostgreSQL** (the SQLite code path has been removed).

> 💡 **Already have data in an old SQLite database?** No problem — Step 4 below shows how to migrate it to Neon in one command.

---

## 2. Prerequisites — Accounts You Need

All three accounts are **free** and require only an email or a GitHub login. No credit card needed.

| Account | Sign up at | How long | What you'll get |
|---|---|---|---|
| GitHub | https://github.com | 2 min | A place to host your code (Vercel reads from here) |
| Vercel | https://vercel.com | 2 min | Website hosting (sign up **with GitHub** — one click) |
| Neon | https://neon.tech | 2 min | PostgreSQL database (sign up **with GitHub**) |
| Cloudinary | https://cloudinary.com | 2 min | Image storage (sign up with email/Google) |

> 👉 **You also need your project code pushed to GitHub.** If you haven't done that yet, see **Step 0** below.

### Step 0 (only if needed): Push your code to GitHub

```bash
cd /home/z/my-project

# Initialize git (only if not already a git repo)
git init
git add .
git commit -m "AI Bike Shop OS — Vercel ready"

# 1. Go to https://github.com/new and create a NEW EMPTY repo (no README, no .gitignore)
#    Name it something like "bike-shop"
# 2. Copy the URL GitHub shows you, then:
git remote add origin https://github.com/YOUR_USERNAME/bike-shop.git
git branch -M main
git push -u origin main
```

> ⚠️ `.env` is in `.gitignore` — your secrets are never committed. Good.

---

## 3. Step 1 — Create a Neon PostgreSQL Database

**Neon** is a serverless PostgreSQL service. The free tier gives you 0.5 GB of storage — enough for tens of thousands of products.

### What to do:

1. Go to **https://neon.tech** → click **"Sign up"** → **"Continue with GitHub"**.
2. Authorize Neon to access your GitHub (it only reads your email — it won't touch your code).
3. Click **"Create New Project"**.
4. Fill in:
   - **Name**: `bike-shop-db` (any name is fine)
   - **Postgres version**: `17` (default — leave it)
   - **Region**: pick the one closest to you. For India, choose **`AWS Asia Pacific (Singapore)`** or **`AWS Asia Pacific (Mumbai)`** if available.
   - **Default database**: `neondb` (default — leave it)
5. Click **"Create Project"**.

### Copy your connection string:

After the project is created, Neon shows you a **Connection String**. It looks like this:

```
postgresql://neondb_owner:AbCdEf123456@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Copy this entire string and save it somewhere safe** (a notes app, a password manager, etc.). You'll need it twice:
- Once to push the database schema (Step 3 below)
- Once to set as `DATABASE_URL` on Vercel (Step 6 below)

> ⚠️ **IMPORTANT — the `?sslmode=require` at the end is mandatory.** Neon requires SSL for all external connections. If your string doesn't have it, append it manually:
> ```
> ?sslmode=require
> ```

> 💡 **What does this string mean?** It's like a postal address for your database:
> - `neondb_owner` = your username
> - `AbCdEf123456` = your password (keep it secret!)
> - `ep-cool-name-123456.us-east-2.aws.neon.tech` = the server address
> - `neondb` = the database name
> - `?sslmode=require` = "connect securely"

---

## 4. Step 2 — Create a Cloudinary Account

**Cloudinary** is an image storage + CDN service. The free tier gives you 25 "credits" per month — roughly 25 GB of storage + bandwidth. For a small bike shop with a few hundred product photos, you'll use less than 1 GB.

### What to do:

1. Go to **https://cloudinary.com** → click **"Sign up for free"**.
2. Fill in your name, email, and a password (or sign up with Google).
3. No credit card required.
4. After signup, you'll land on your **Dashboard**. Look for the **"Account Details"** section. You need three values:

| Value | Example | Where to find it |
|---|---|---|
| **Cloud Name** | `dxyz123ab` | Top of the dashboard, or **Settings → Account** |
| **API Key** | `123456789012345` | Dashboard → **Settings → API Keys** |
| **API Secret** | `AbCdEfGhIjKlMnOpQrStUvWxYz` | Same page — click **"Reveal"** to see it |

**Save all three values.** You'll add them to Vercel in Step 6.

> ⚠️ **Keep your API Secret private.** Never commit it to git or share it publicly.

---

## 5. Step 3 — Push the Database Schema to Neon

Now that you have a Neon database, you need to **create the tables** in it (User, Product, Sale, etc.). The schema is defined in `prisma/schema.prisma`. Prisma's `db push` command creates all the tables for you.

### Run this command on your computer (in the project folder):

```bash
cd /home/z/my-project

# Replace the URL with YOUR Neon connection string (must include ?sslmode=require)
DATABASE_URL="postgresql://neondb_owner:AbCdEf123456@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  npx prisma db push
```

### What you'll see:

```
🛠️  Applying your schema to the database…
Your database is now in sync with your Prisma schema.

✔ Generated Prisma Client (v6.x.x) to ./node_modules/@prisma/client
```

### What just happened:
- Prisma read `prisma/schema.prisma` (where all your tables are defined).
- It connected to your Neon database using the URL you provided.
- It created all the empty tables: `User`, `Category`, `Location`, `Product`, `Sale`, `SaleItem`, `Customer`, `Movement`, `Settings`, `ChatMessage`, `LedgerEntry`.
- It generated the Prisma Client (TypeScript code that knows how to talk to these tables).

> 💡 You can verify this on the **Neon dashboard** → your project → **"Tables"** tab. You'll see all the empty tables listed there.

> 💡 **Want to test with local PostgreSQL first?** Run `bash scripts/ensure-postgres.sh` — it downloads a portable PostgreSQL 17 (no `sudo` needed) and starts it on port 5433. Then set `DATABASE_URL=postgresql://postgres@localhost:5433/bikeshop` in your `.env` file and run `bun run dev`.

---

## 6. Step 4 — Migrate Existing Data (if you have any)

> ⏭️ **Skip this step** if you have no existing data (fresh install). Go to Step 5.

If you previously ran the app with the old SQLite database (`db/custom.db`) and have **real products, sales, or customers** you want to keep, run the migration script. It reads all rows from SQLite and writes them to PostgreSQL, preserving original IDs.

### Pre-requisites:
1. The old SQLite file exists at `./db/custom.db` (or wherever you set `SQLITE_PATH`).
2. You've already run Step 3 (schema is pushed — tables exist).

### Run this command (from the project folder):

```bash
cd /home/z/my-project

# Replace both values:
#   SQLITE_PATH    = path to your old SQLite DB
#   DATABASE_URL   = your Neon connection string (must include ?sslmode=require)
SQLITE_PATH=./db/custom.db \
DATABASE_URL="postgresql://neondb_owner:AbCdEf123456@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  bun run scripts/migrate-sqlite-to-postgres.ts
```

### What you'll see (example output):

```
📖 Opening SQLite source: ./db/custom.db
🔌 Connecting to PostgreSQL (DATABASE_URL from env/.env)...

🧹 Clearing existing PostgreSQL data...
  ✓ Cleared User
  ✓ Cleared Category
  ✓ Cleared Location
  ...

🔄 Migrating data (SQLite → PostgreSQL)...
  ✓ User: 2/2 rows migrated
  ✓ Category: 11/11 rows migrated
  ✓ Product: 23/23 rows migrated
  ✓ Sale: 104/104 rows migrated
  ...

📊 PostgreSQL row counts (post-migration):
  User: 2
  Category: 11
  Product: 23
  Sale: 104

✅ Migration complete! 142/142 rows migrated.
```

### How it works:
- Reads all rows from each SQLite table (via `bun:sqlite`).
- Inserts them into PostgreSQL (via Prisma), preserving original IDs.
- Converts SQLite types to PostgreSQL types automatically (e.g., `0/1` → `false/true`, ISO strings → `Date`).
- Migrates tables in foreign-key order (parents before children) to satisfy constraints.
- **Safe to re-run** — clears PostgreSQL tables first (in reverse FK order), then re-inserts.

> 💡 **Verify on Neon dashboard** → your project → **"Tables"** tab → click any table to see the rows.

> ⚠️ **If your SQLite file has a password or is in a weird location**, set `SQLITE_PATH` to the absolute path, e.g. `/home/yourname/old-shop.db`.

---

## 7. Step 5 — Deploy to Vercel

Now we put the website on the internet.

### What to do:

1. Go to **https://vercel.com** → click **"Sign Up"** → **"Continue with GitHub"**.
2. Authorize Vercel to access your GitHub.
3. Click **"Add New…"** → **"Project"**.
4. Under **"Import Git Repository"**, find your `bike-shop` repo. Click **"Import"**.
5. Vercel auto-detects Next.js — leave the default settings:
   - **Framework Preset**: Next.js
   - **Build Command**: `bun run prebuild && next build` *(from `vercel.json` — already set)*
   - **Install Command**: `bun install` *(already set)*
6. **DON'T click Deploy yet** — you need to set environment variables first (Step 6).

> 💡 Vercel reads the `vercel.json` file in your repo, which already configures everything correctly. You don't need to touch any settings.

> 💡 The `prebuild` script (`scripts/setup-db.sh`) automatically generates the Prisma client **during the Vercel build** — so you don't have to worry about that.

---

## 8. Step 6 — Set Environment Variables on Vercel

On the same "Configure Project" page (before you click Deploy), scroll down to **"Environment Variables"**. Add each of these:

### Required environment variables

| Name | Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:AbCdEf...?sslmode=require` | Your Neon connection string from Step 1. **Must end with `?sslmode=require`.** |
| `SESSION_SECRET` | (a random 32+ character string) | Used to sign login cookies. Generate one with `openssl rand -base64 32` (see below). |
| `CLOUDINARY_CLOUD_NAME` | `dxyz123ab` | Your Cloudinary Cloud Name from Step 2. |
| `CLOUDINARY_API_KEY` | `123456789012345` | Your Cloudinary API Key from Step 2. |
| `CLOUDINARY_API_SECRET` | `AbCdEfGhIjKlMnOpQrStUvWxYz` | Your Cloudinary API Secret from Step 2. |

### Optional environment variables (for AI features)

The app works fully without AI. To enable the AI Assistant, voice search, photo recognition, OCR, and smart insights, add:

| Name | Value | Description |
|---|---|---|
| `ZAI_API_KEY` | `your-z-ai-api-key` | Get one from https://z.ai |
| `ZAI_BASE_URL` | `https://api.z.ai/v1` | The Z.ai API endpoint. Leave as-is. |

### How to generate `SESSION_SECRET`

Run this in any terminal (Linux/Mac/Git Bash on Windows):

```bash
openssl rand -base64 32
```

It outputs something like: `K3x9pL2mN8qR4vT7wY1zA6bC5dE0fG3hI9jK8lM2nO7pQ4rS6tU1vW3xY0zA9bC=`. Copy and paste that as the `SESSION_SECRET` value.

> 💡 No `openssl`? Use https://generate-secret.vercel.app/32 — it generates a random 32-char string in your browser.

### Deploy!

After adding all the env vars:
1. Click **"Deploy"**.
2. Wait **2–5 minutes** for the build to finish. You'll see live build logs streaming.
3. When it's done, you'll see a big **"Congratulations"** screen with your URL: **`https://bike-shop-os.vercel.app`** 🎉

> ⚠️ If the build fails, check the logs. The most common cause is a typo in your `DATABASE_URL` (e.g., missing `?sslmode=require`).

---

## 9. Step 7 — Verify the Deployment

### 9.1 Initialize the database

Vercel is serverless — there's no shell to run seed scripts. We built an **`/api/init`** endpoint that does it for you. Visit this URL in your browser:

```
https://YOUR-APP-URL.vercel.app/api/init
```

You should see:

```json
{
  "ok": true,
  "alreadySeeded": false,
  "message": "Database initialized successfully! Login with admin/admin123."
}
```

> If you migrated data in Step 4 (instead of starting fresh), the endpoint will say `"alreadySeeded": true` — that's fine, your data is already there.

### 9.2 Open the app

Visit your main URL: **`https://YOUR-APP-URL.vercel.app`**

You should see the **login page** with the bike shop favicon.

### 9.3 Log in

- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ **Change this password immediately** after logging in: go to **Settings → Change Password**.

### 9.4 Verify everything works

Walk through this checklist:

1. ✅ **Dashboard loads** — you see "Namaste, Sharma 👋" and your shop stats.
2. ✅ **Products page** — shows seeded products (or your migrated products).
3. ✅ **Add a new product**:
   - Click "Add Product"
   - Fill in name, price, quantity
   - **Upload a photo** (any JPG/PNG, under 5 MB)
   - Save it
   - The photo should display in the product card — it's now stored in **Cloudinary** (check your Cloudinary dashboard → Media Library → `bike-shop/products/` folder).
4. ✅ **Make a sale** — click "New Sale", add items, complete it, print the bill (PDF/PNG).
5. ✅ **Logout → Log back in** — your data should still be there (it's stored in **Neon Postgres**).

### 9.5 If something doesn't work

See the **Troubleshooting** section below.

---

## 10. Troubleshooting

### Build fails on Vercel (red ✗ during build)

| Symptom | Fix |
|---|---|
| `Environment variable "DATABASE_URL" not found` | Add `DATABASE_URL` in Vercel → Settings → Environment Variables, then redeploy. |
| `Error: P1013: database URL is invalid` | Check that your Neon URL starts with `postgresql://` (not `postgres://`) and ends with `?sslmode=require`. |
| `Error: P1001: Can't reach database server` | The hostname in `DATABASE_URL` is wrong. Re-copy it from the Neon dashboard. |
| `prebuild script failed` | Make sure `scripts/setup-db.sh` and `prisma/schema.prisma` are committed to GitHub. |
| `Cannot find module '@prisma/client'` | The `prebuild` script runs `prisma generate` before `next build`. Check the build log for "Generating Prisma client…" — if missing, your `vercel.json` build command is wrong. |

### App loads but throws "Internal Server Error"

| Symptom | Fix |
|---|---|
| Prisma error in logs: `relation "User" does not exist` | You forgot Step 3 — run `DATABASE_URL=... npx prisma db push` locally to create tables. |
| Login returns 401 | Visit `/api/init` first to seed the admin user. |
| Login returns 500 | Check Vercel function logs (Dashboard → Logs). Usually a `DATABASE_URL` issue. |

### SSL / connection errors

| Symptom | Fix |
|---|---|
| `Error: P1000: ... SSL connection is required` | Your `DATABASE_URL` is missing `?sslmode=require` at the end. Add it. |
| `Error: ... certificate verify failed` | Neon's SSL cert is fine — you probably have a typo in the URL. Re-copy from Neon. |
| `Error: ... password authentication failed` | The password part of your `DATABASE_URL` is wrong. Re-copy from Neon. |

### Image upload fails

| Symptom | Fix |
|---|---|
| Upload returns 500 — `Cloudinary not configured` | One or more `CLOUDINARY_*` env vars are missing on Vercel. Add all three (cloud name, API key, API secret). |
| Upload returns 500 — `Invalid cloud name` | `CLOUDINARY_CLOUD_NAME` is wrong. Get it from the Cloudinary dashboard. |
| Upload succeeds but image doesn't display | Shouldn't happen — the `SafeImage` component handles `https://res.cloudinary.com/...` URLs automatically. Check the browser console for mixed-content errors. |
| Image saved locally (URL is `/api/uploads/...` instead of `https://res.cloudinary.com/...`) | Cloudinary env vars aren't set — the app fell back to local storage. On Vercel this won't work because the filesystem is read-only. **Fix: set the 3 Cloudinary env vars and redeploy.** |

### Prisma client errors

| Symptom | Fix |
|---|---|
| `Error: Prisma Client is not configured` | The `prebuild` script didn't run. Check `vercel.json` has `buildCommand: "bun run prebuild && next build"`. |
| `Error: Unknown arg `...` for query` | Your Prisma Client is out of sync with `schema.prisma`. The `prebuild` script regenerates it on every build — so just redeploy. |

### Migration script errors (Step 4)

| Symptom | Fix |
|---|---|
| `✗ SQLite file not found: ./db/custom.db` | Set `SQLITE_PATH` to the correct absolute path: `SQLITE_PATH=/home/you/old-shop.db bun run scripts/...` |
| `✗ Migration failed: ... unique constraint` | Old data has duplicate IDs. The script clears PG first, so this shouldn't happen — re-run. |
| `✗ ... relation "Product" does not exist` | You skipped Step 3. Run `npx prisma db push` first. |

### AI features don't work

| Symptom | Fix |
|---|---|
| AI Assistant says "AI not configured" | `ZAI_API_KEY` env var is missing on Vercel. Add it (optional — core app works without AI). |
| Voice search returns 500 | Same — needs `ZAI_API_KEY` + `ZAI_BASE_URL`. |

---

## 11. Cost Expectations — Free Tier Limits

Everything below is **100% free** for a small bike shop. You only pay if you grow way beyond a single shop's usage.

### Vercel — Hobby (free)

| Resource | Free limit | What it means for your shop |
|---|---|---|
| Bandwidth | 100 GB / month | 100 visitors/day × 3 MB = 9 GB/mo. Way under. ✅ |
| Build time | 6,000 minutes / month | Each deploy is ~3 min. 200 deploys/mo. ✅ |
| Serverless function calls | 100,000 / day | Even 1,000 sales/day = 10,000 calls. ✅ |
| Max function duration | 10 seconds (free) | Our API routes finish in <500ms. ✅ |

### Neon — Free tier

| Resource | Free limit | What it means for your shop |
|---|---|---|
| Storage | 0.5 GB | 1 product ≈ 1 KB → ~500,000 products. ✅ |
| Compute (always-available) | 1 always-on + autoscaling | No cold starts on free tier. ✅ |
| Projects | 1 | Enough for one shop. ✅ |
| Branches | 10 | Useful for backups. ✅ |

### Cloudinary — Free tier

| Resource | Free limit | What it means for your shop |
|---|---|---|
| Credits | 25 / month | 1 credit ≈ 1 GB of storage OR bandwidth. |
| Storage | ~25 GB | 1 product photo ≈ 500 KB → ~50,000 photos. ✅ |
| Monthly bandwidth | ~25 GB | 100 visitors viewing 5 photos each = 250 MB/mo. ✅ |
| Transformations | 25 / month | We don't use server-side transformations. ✅ |

### When would you actually exceed the free tier?

Realistically, **never** for a single shop. You'd need to:
- Have **500+ daily visitors** to exceed Vercel's bandwidth
- Store **50,000+ product photos** to exceed Cloudinary's storage
- Manage **500,000+ products** to exceed Neon's storage

If you ever do exceed, you can:
- Upgrade **Vercel** to Pro ($20/mo)
- Upgrade **Neon** to Launch (~$19/mo for 10 GB)
- Upgrade **Cloudinary** to Plus (~$89/mo — but you'll never need this)

> 💡 **For a single rural bike shop in India, the free tier is permanent.** You will likely never pay a rupee.

---

## Alternative Deployment Options

Vercel is the **100% free** option, but it requires three services. If you'd rather have **one service** (and don't mind paying a small amount), the app also supports:

### Railway (simplest, ~$3–5/month after free trial)
- **One service** — database + uploads + app, all in one
- Uses **SQLite** + local file uploads (no Cloudinary needed)
- Persistent volume keeps your data
- Free $5/month credit covers a small shop
- See **[`RAILWAY-DEPLOY.md`](./RAILWAY-DEPLOY.md)** for the full guide

### Render (middle ground, ~$7/month)
- **One service** with persistent disk
- Uses SQLite + local file uploads (no Cloudinary needed)
- Uses the included `Dockerfile`
- See **[`RENDER-DEPLOY.md`](./RENDER-DEPLOY.md)** for the full guide

### Quick comparison

| | **Vercel** (this guide) | **Railway** | **Render** |
|---|---|---|---|
| Monthly cost | **FREE** | $3–5 (free trial covers ~1 month) | ~$7 |
| Number of services | 3 (Vercel + Neon + Cloudinary) | 1 | 1 |
| Database | PostgreSQL (Neon) | SQLite (Railway volume) | SQLite (Render disk) |
| Image uploads | Cloudinary (required) | Local filesystem | Local filesystem |
| Setup complexity | Medium (3 signups) | Easy (1 signup) | Easy (1 signup) |
| Best for | **Free forever** | **Simplest setup** | **Middle ground** |

> 💡 **Recommendation**: If you want **₹0/month forever**, use **Vercel** (this guide). If you want **fewer moving parts** and don't mind $5/month, use **Railway**.

---

## Quick Checklist

Print this out or copy it to your phone:

- [ ] **GitHub** repo created and code pushed
- [ ] **Neon** project created; connection string copied (ends with `?sslmode=require`)
- [ ] **Cloudinary** account created; Cloud Name + API Key + API Secret copied
- [ ] **Step 3 done**: ran `DATABASE_URL=... npx prisma db push` locally — tables created in Neon
- [ ] **Step 4 done** (if you had old data): ran the migration script — data now in Neon
- [ ] **Vercel** project imported from GitHub
- [ ] All **5 required env vars** set on Vercel:
  - [ ] `DATABASE_URL`
  - [ ] `SESSION_SECRET`
  - [ ] `CLOUDINARY_CLOUD_NAME`
  - [ ] `CLOUDINARY_API_KEY`
  - [ ] `CLOUDINARY_API_SECRET`
- [ ] (Optional) `ZAI_API_KEY` + `ZAI_BASE_URL` added for AI features
- [ ] First **Deploy** succeeded
- [ ] Visited `/api/init` — got `"ok": true`
- [ ] Login works (`admin` / `admin123`)
- [ ] **Password changed** in Settings
- [ ] Added a product with a photo — photo displays (check Cloudinary Media Library)
- [ ] Made a sale — bill printed
- [ ] Logged out and back in — data persisted

**Done?** Your bike shop is LIVE on the internet, 100% free. 🎉🏍️

---

## Daily Operations

### Update the app (after making code changes)

```bash
git add .
git commit -m "your changes"
git push
```

Vercel **auto-redeploys** on every push — usually in 2–3 minutes. No buttons to click.

### View your data

- **Database**: Neon dashboard → your project → **"Tables"** tab → click any table to view/edit rows
- **Images**: Cloudinary dashboard → **"Media Library"** → `bike-shop/` folder
- **Logs**: Vercel dashboard → your project → **"Logs"** tab

### Backup your database

- **Easiest**: Neon dashboard → **"Branches"** → click **"Create Branch"** — this snapshots your database
- **Manual**: `pg_dump "your-neon-url" > backup.sql`

### Reset the database (start fresh)

```bash
# WARNING: This deletes ALL data!
DATABASE_URL="your-neon-url" npx prisma db push --force-reset

# Then re-seed by visiting:
# https://your-app.vercel.app/api/init
```

---

**Questions?** Check the **Troubleshooting** section above, or the [Vercel docs](https://vercel.com/docs), [Neon docs](https://neon.tech/docs), or [Cloudinary docs](https://cloudinary.com/documentation).

# 🚂 Railway Deployment Guide — AI Bike Shop OS

> **Time to live**: ~5 minutes after pushing to GitHub
> **Cost**: FREE ($5 credit/month covers a small shop easily)
> **Code changes**: ZERO — SQLite + local uploads work as-is with a persistent volume
> **Result**: Live website at `https://your-shop.up.railway.app`

---

## ✅ Why Railway (not Vercel/Netlify)?

This app uses **SQLite** (file database) and **local file uploads** (product photos, logo, QR code).
Both need a **persistent filesystem** — which serverless platforms (Vercel, Netlify) do NOT have.

| Feature | Vercel / Netlify | **Railway** |
|---|---|---|
| SQLite database | ❌ Read-only filesystem | ✅ Persistent volume |
| Local file uploads | ❌ Lost on every deploy | ✅ Persisted in volume |
| Code changes needed | Major rewrite (Postgres + cloud storage) | **ZERO** |
| Free tier | Yes, but needs $7/mo Postgres | $5 credit/mo (covers the whole app) |

**Railway is the only platform where this app works with zero code changes.**

---

## 📋 What You Need

1. A **GitHub account** (free at github.com)
2. Your project code pushed to a GitHub repository

---

## Step 0: Push Code to GitHub

If you haven't pushed yet:

```bash
cd /home/z/my-project

# Initialize git
git init
git add .
git commit -m "AI Bike Shop OS — ready to deploy"

# Create a NEW EMPTY repo on GitHub.com first (don't add README/license)
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/bike-shop.git
git branch -M main
git push -u origin main
```

> ⚠️ Make sure `.env` is in `.gitignore` (it is by default). Never commit your real `.env`.

---

## Step 1: Create Railway Account

1. Go to **https://railway.app**
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway
4. You automatically get **$5 free credit** (≈ ₹400 — enough for a bike shop)

---

## Step 2: Deploy from GitHub

1. Click **"New Project"** (top-right)
2. Select **"Deploy from GitHub repo"**
3. Find and select your `bike-shop` repo
4. Railway starts building immediately (takes 2-4 minutes)

> Railway auto-detects Next.js + the `railway.json` config in your repo.
> The build runs `bun run db:generate && next build` automatically.

---

## Step 3: Add a Persistent Volume (IMPORTANT!)

This is where your database + uploaded images will live permanently.

1. Go to your Railway project → click the **service** (your app)
2. Click the **"Settings"** tab
3. Find the **"Volumes"** section
4. Click **"Add Volume"**
5. Set:
   - **Mount path**: `/data`
   - **Size**: `1 GB` (free — enough for ~10,000 products with photos)
6. Click **"Add"**

> Railway automatically sets `RAILWAY_VOLUME_MOUNT_DIR=/data` when a volume is attached.
> Our code reads this and stores the SQLite DB at `/data/custom.db` and uploads at `/data/uploads/`.

---

## Step 4: Set Environment Variables

1. Go to your service → **"Variables"** tab
2. Click **"New Variable"** and add each:

| Variable | Value | Required? |
|---|---|---|
| `DATABASE_URL` | `file:/data/custom.db` | ✅ YES |
| `SESSION_SECRET` | (random string — see below) | ✅ YES |
| `NODE_ENV` | `production` | ✅ YES |

### Generate SESSION_SECRET:

Run this in any terminal (or use an online generator):
```bash
openssl rand -base64 32
```

Copy the output (looks like `K7x9mP2vQ8wR4...`) and paste it as the `SESSION_SECRET` value.

> This signs your login cookies. Without it, the app uses a default insecure value.

### Optional: Enable AI Features

The app works fully without AI. To enable the AI assistant, image recognition,
voice search, and smart insights, add:

| Variable | Value |
|---|---|
| `ZAI_API_KEY` | Your Z.AI API key (from https://z.ai) |
| `ZAI_BASE_URL` | `https://api.z.ai/v1` |

> When these are set, the app auto-creates its config file. When not set,
> AI endpoints return a friendly error and the rest of the app works normally.

---

## Step 5: Get Your Live URL

1. Go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. You get a URL like: **`https://bike-shop-ai.up.railway.app`** 🎉

> Railway auto-redeploys whenever you change variables or push new code.

---

## Step 6: Login & Verify

Visit your URL. You should see the login page.

**Login credentials** (auto-seeded on first deploy):
- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ **Change the password immediately** after first login:
> Go to Settings → Change Password

### Verify everything works:
1. ✅ Dashboard loads with shop stats
2. ✅ Products page shows seeded inventory (20 sample products)
3. ✅ Add a new product → upload a photo → save → photo displays
4. ✅ Create a sale → print bill
5. ✅ Logout → login again → **all data is still there!**

The database auto-initializes on every deploy (the `startCommand` runs
`prisma db push` to create tables + `seed.ts` to add initial data).
This is **idempotent** — it won't duplicate data on restarts.

---

## 🔄 Daily Operations

### Update the app (after code changes):
```bash
git add .
git commit -m "your changes"
git push
```
Railway auto-redeploys on every push! 🎉

### Backup the database:
Use Railway's web terminal (service → click "Terminal" icon):
```bash
cp /data/custom.db /data/backup-$(date +%F).db
```
Or download the file via Railway's file browser.

### View logs:
Railway dashboard → your deployment → **"Logs"** tab

---

## 💰 Cost Management

- Railway gives **$5 free credit/month**
- A small bike shop app uses **~$2-3/month** (mostly idle)
- So it's essentially **FREE forever**
- If credit runs out, Railway **pauses** (doesn't delete) your app
- To stay free: compress images before uploading (under 1 MB each)

---

## 🆘 Troubleshooting

### Build fails
- Check **"Deployments"** → click the failed build → read the logs
- Common cause: missing `DATABASE_URL` or `SESSION_SECRET` → add them in Variables

### App loads but can't login
- The database might not have seeded → check logs for "Seed complete!"
- If logs show seed errors, open Railway Terminal and run:
  ```bash
  bun run prisma/seed.ts
  ```

### Images don't upload / don't display
- Volume not attached → do Step 3 (mount at `/data`)
- Check that `DATABASE_URL` is `file:/data/custom.db` (not a local path)

### Data disappears between deploys
- Volume not attached, OR mount path is wrong → must be `/data`
- Verify `RAILWAY_VOLUME_MOUNT_DIR` is shown in Variables (Railway auto-sets it)

### AI features don't work
- `ZAI_API_KEY` not set → add it in Variables (optional — core app works without AI)

---

## 📋 Quick Checklist

- [ ] Code pushed to GitHub
- [ ] Railway account created (GitHub login)
- [ ] Project deployed from GitHub repo
- [ ] Volume mounted at `/data` (1 GB)
- [ ] `DATABASE_URL` = `file:/data/custom.db`
- [ ] `SESSION_SECRET` set (random string)
- [ ] `NODE_ENV` = `production`
- [ ] Domain generated (live URL works)
- [ ] Login works (admin / admin123)
- [ ] Password changed to something secure
- [ ] Product + image upload works
- [ ] Data persists across logout/login

**Done? Your bike shop is LIVE on the internet! 🎉🏍️**

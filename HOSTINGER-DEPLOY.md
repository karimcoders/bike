# 🌐 Hostinger Deployment Guide — AI Bike Shop OS

> **Important**: Hostinger **Premium** plan does NOT support Next.js deployment.
> You need **Business plan** or higher, OR a **VPS**.

---

## ⚠️ Plan Requirements

Your screenshot shows you have **Hostinger Premium** (expires 2027). The "Deploy Web App"
option is **locked (🔒)** because Next.js deployment requires **Business plan or higher**.

| Plan | Next.js Support | Price |
|---|---|---|
| Premium (you have this) | ❌ Locked | — |
| **Business** | ✅ Deploy Web App | ~₹200-400/mo |
| **VPS (KVM)** | ✅ Full control (Docker) | ~₹400-800/mo |

### You have 3 options:

1. **Upgrade to Business plan** → Use "Deploy Web App" (GitHub or ZIP upload)
2. **Use Hostinger VPS** (if you have one) → Use Docker (full control)
3. **Use Railway/Render instead** → Already ready, free trial, zero extra cost

> 💡 **Recommendation**: If you already have Premium until 2027, upgrading to Business
> adds Next.js support. But Railway/Render is cheaper and already configured.
> See `RAILWAY-DEPLOY.md` or `RENDER-DEPLOY.md` for the free alternative.

---

## Option A: Hostinger Business Plan (Deploy Web App)

### Method 1: GitHub Auto-Deploy (Recommended)

1. **Push code to GitHub**:
   ```bash
   cd /home/z/my-project
   git init
   git add .
   git commit -m "AI Bike Shop OS"
   git remote add origin https://github.com/YOUR_USERNAME/bike-shop.git
   git push -u origin main
   ```

2. **In hPanel** → Websites → **Deploy Web App**
3. Click **"Connect GitHub"** and authorize
4. Select your `bike-shop` repo
5. Hostinger auto-detects Next.js and configures the build

6. **Set Environment Variables** (in the Deploy Web App settings):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `file:/home/uXXXXX/data/custom.db` |
   | `SESSION_SECRET` | (random 32-char string) |
   | `NODE_ENV` | `production` |
   | `STORAGE_DIR` | `/home/uXXXXX/data` |

   > Replace `uXXXXX` with your Hostinger username (found in hPanel → Files → File Manager)
   > Or use the path Hostinger shows as your home directory.

7. **Set Build Command**:
   ```
   npm install && npx prisma generate && npm run build
   ```

8. **Set Start Command**:
   ```
   node .next/standalone/server.js
   ```

9. Click **Deploy** → wait 3-5 minutes
10. Your app is live at `https://yourdomain.com` or `https://uXXXXX.hostinger.app` 🎉

### Method 2: ZIP Upload (if GitHub not connected)

1. **Build the ZIP locally**:
   ```bash
   cd /home/z/my-project
   bash scripts/build-hostinger.sh
   ```
   This produces `bike-shop-hostinger.zip` (~50-100 MB)

2. **In hPanel** → Deploy Web App → **Upload ZIP**
3. Upload `bike-shop-hostinger.zip`
4. Set the same environment variables as Method 1 (step 6)
5. Set Start Command: `bash start.sh`
6. Deploy!

---

## Option B: Hostinger VPS (Full Docker Control)

If you have a Hostinger VPS (KVM), you can run the app with Docker —
same as Railway/Render, full control, persistent storage.

### Step 1: SSH into your VPS
```bash
ssh root@your-vps-ip
```

### Step 2: Install Docker + Docker Compose
```bash
apt update && apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
```

### Step 3: Clone your repo
```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/bike-shop.git
cd bike-shop
```

### Step 4: Create a docker-compose.yml
```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - DATABASE_URL=file:/data/custom.db
      - SESSION_SECRET=CHANGE_ME_TO_RANDOM_STRING
      - NODE_ENV=production
      - STORAGE_DIR=/data
    restart: unless-stopped
EOF
```

### Step 5: Deploy!
```bash
docker-compose up -d --build
```

Your app is live at `http://your-vps-ip:3000`

### Step 6: Add SSL + Domain (optional, with Caddy)
```bash
apt install -y caddy
cat > /etc/caddy/Caddyfile << 'EOF'
yourdomain.com {
    reverse_proxy localhost:3000
}
EOF
systemctl restart caddy
```

Now it's live at `https://yourdomain.com` with free SSL! 🎉

---

## 🔧 Environment Variables (All Methods)

| Variable | Required? | Example Value | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ YES | `file:/home/uXXX/data/custom.db` | SQLite DB path (must be writable) |
| `SESSION_SECRET` | ✅ YES | `K7x9mP2vQ8wR4...` | Random string for cookie signing |
| `NODE_ENV` | ✅ YES | `production` | Enables production mode |
| `STORAGE_DIR` | ✅ YES | `/home/uXXX/data` | Where uploads + DB are stored |
| `ZAI_API_KEY` | Optional | `your-key` | Enable AI features (from z.ai) |
| `ZAI_BASE_URL` | Optional | `https://api.z.ai/v1` | AI API endpoint |

### Generate SESSION_SECRET:
```bash
openssl rand -base64 32
```

---

## 🗄️ Where is Data Stored?

On Hostinger, your data (SQLite DB + uploaded images) must be in a **persistent writable** directory.

### Finding your home directory:
- hPanel → **Files** → **File Manager**
- Your home path looks like: `/home/u1234567/`
- Create a `data` folder there: `/home/u1234567/data/`

### Set these to match:
```
DATABASE_URL=file:/home/u1234567/data/custom.db
STORAGE_DIR=/home/u1234567/data
```

> The app stores:
> - Database: `$STORAGE_DIR/custom.db`
> - Product photos: `$STORAGE_DIR/uploads/products/`
> - Shop logo: `$STORAGE_DIR/uploads/logos/`
> - UPI QR: `$STORAGE_DIR/uploads/qr/`

---

## ✅ First Deploy Checklist

- [ ] Plan is **Business** or you have a **VPS**
- [ ] Code pushed to GitHub (or ZIP built with `scripts/build-hostinger.sh`)
- [ ] Environment variables set (DATABASE_URL, SESSION_SECRET, NODE_ENV, STORAGE_DIR)
- [ ] `STORAGE_DIR` points to a writable persistent directory
- [ ] First deploy successful
- [ ] Visit the URL → login page appears
- [ ] Login with `admin` / `admin123`
- [ ] **Change password immediately** (Settings → Change Password)
- [ ] Add a product → upload photo → photo displays
- [ ] Logout → login → data persists

---

## 🆘 Troubleshooting

### "Deploy Web App" is locked (🔒)
- Your plan is Premium → upgrade to **Business** or use VPS/Railway/Render

### Build fails on Hostinger
- Check deploy logs in hPanel → Deploy Web App → Logs
- Common: missing env vars → set all required variables
- Common: `prisma generate` fails → ensure `DATABASE_URL` is set before build

### App deploys but shows "Internal Server Error"
- Check logs for startup errors
- DB might not be initialized → the start script runs `prisma db push` + seed automatically
- If seed fails, SSH in (VPS) or use File Manager to check `$STORAGE_DIR/custom.db` exists

### Images don't upload
- `STORAGE_DIR` not set or not writable
- Check the directory exists and has write permissions (755 or 775)

### Data disappears after redeploy
- `STORAGE_DIR` is pointing to a non-persistent location
- On shared hosting: use your home directory `/home/uXXXXX/data/`
- On VPS: use a mounted volume `./data:/data`

### SQLite database errors
- Ensure the directory in `DATABASE_URL` exists and is writable
- SQLite needs write access to both the DB file AND its parent directory

---

## 💰 Cost Comparison

| Option | Monthly Cost | Notes |
|---|---|---|
| Hostinger Premium (current) | Already paid | ❌ Can't deploy Next.js |
| Hostinger Business upgrade | ~₹200-400 extra/mo | ✅ Deploy Web App |
| Hostinger VPS | ~₹400-800/mo | ✅ Full Docker control |
| **Railway** (recommended) | **FREE-$5/mo** | ✅ Already configured |
| **Render** (recommended) | **~$7/mo** | ✅ Already configured |

> 💡 **If cost matters**: Railway/Render is cheaper and already ready.
> Your Premium plan is great for PHP/HTML sites, not Next.js.

---

## 🤔 Which Should You Choose?

| If... | Then use... |
|---|---|
| You want the cheapest option | **Railway** (free $5 credit, ~$3-5/mo after) |
| You want to use your existing Hostinger | Upgrade to **Business** (~₹200-400/mo extra) |
| You want full server control | **Hostinger VPS** (~₹400-800/mo) |
| You want zero config | **Railway** (just push to GitHub, done) |

> **My recommendation**: Start with **Railway** (free, already ready).
> If you love the app and want it permanent on Hostinger, upgrade to Business later
> and redeploy — the code is the same.

---

## 📞 Quick Help

If stuck:
1. Check **Deploy logs** (hPanel → Deploy Web App → Logs)
2. Verify all environment variables are set correctly
3. Verify `STORAGE_DIR` is writable and persistent
4. Check the app URL in browser console for errors
5. Screenshot the error and ask!

**Your bike shop on the internet! 🎉🏍️**

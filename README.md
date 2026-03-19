# Datumprikker — Interview Scheduling

A Dutch-language interview scheduling web application (like datumprikker.nl) where:

1. **Beheerder (Admin)** creates an interview event and sets available time slots
2. **Studenten (Students)** click the time slots when they're available
3. **Ondernemers (Entrepreneurs)** click the time slots when they're available
4. The system automatically highlights **Matches** — time slots where at least one student AND one entrepreneur are both available

## Tech Stack

- **Node.js** + **Express** — web server
- **better-sqlite3** — lightweight embedded database
- **EJS** — server-side templating
- **Bootstrap 5** — responsive UI

---

## Hosting (deploy online so anyone can use it)

> **TL;DR** — Render.com is the easiest option if you just want a link you can share.
> Fly.io is the best free option if you need your data to survive restarts.

### Option A — Render.com (recommended for beginners)

Render connects directly to your GitHub repository and redeploys automatically every time you push.

> **Cost:** the `starter` plan used here is **$7 / month** for the web service + **$0.25 / GB / month** for the disk (≈ $7.25/month total). A free plan exists but it does **not** support persistent storage — every restart would erase all events.

**Steps:**

1. Push this repository to GitHub (it is already there).
2. Go to <https://dashboard.render.com> → **New** → **Web Service**.
3. Connect your GitHub account and select the `datumprikker_s4` repository.
4. **Important:** change the **Branch** field to `copilot/add-interview-scheduling-mechanism`
   (all app code lives on this branch until the PR is merged into `main`).
5. Set **Build Command** to `npm ci` and **Start Command** to `npm start`.
6. Set **`BASE_URL`** env var to your `.onrender.com` URL.
   `SESSION_SECRET` and `ADMIN_PASSWORD` are generated automatically from `render.yaml`.
7. Click **Create Web Service** — Render builds and deploys the app.
8. Visit your `.onrender.com` URL when the deploy is green ✅.

#### Auto-deploy on every push (GitHub Actions)

To make Render automatically redeploy whenever new code is pushed, set up the deploy hook secret:

1. In **Render Dashboard** → your datumprikker service → **Settings** → **Build & Deploy** → **Deploy Hook** → click **Generate** → copy the URL.
2. In **GitHub** → this repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name: `RENDER_DEPLOY_HOOK_URL`
   - Value: (paste the URL from step 1)
3. Done — every push to this branch now triggers an automatic Render deploy via GitHub Actions.

> **Note:** if you see "Deploy failed" in the Actions tab because the secret is not set yet, that's expected until you complete step 2 above.

---

### Option B — Fly.io (free tier with persistent storage)

Fly.io has a genuine free tier that includes persistent volumes, making it ideal for SQLite.

**Requirements:** [flyctl](https://fly.io/docs/flyctl/install/) installed, a free Fly.io account.

```bash
# 1. Log in
fly auth login

# 2. From the repository root, create the app (choose a unique name when asked)
fly launch --no-deploy

# 3. Set a secure session secret
fly secrets set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 4. Deploy
fly deploy

# 5. After the first deploy, set BASE_URL to your app's public URL
fly secrets set BASE_URL=https://<your-app-name>.fly.dev

# 6. Open the app in your browser
fly open
```

Fly.io automatically mounts the persistent volume declared in `fly.toml` at `/data`,
so your database survives restarts and new deploys.

---

### Option C — Docker (run on any server or VPS)

```bash
# Build the image
docker build -t datumprikker .

# Run with a local volume for the database
docker run -d \
  -p 3000:3000 \
  -v datumprikker_data:/data \
  -e SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e BASE_URL=http://YOUR_SERVER_IP:3000 \
  --name datumprikker \
  datumprikker
```

---

## Local development

```bash
# Install dependencies
npm install

# (Optional) copy and edit the example env file
cp .env.example .env

# Start the development server
npm start
```

The app runs at <http://localhost:3000>.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` when deploying |
| `SESSION_SECRET` | *(insecure default)* | **Change this in production** — long random string |
| `DATABASE_PATH` | `data/datumprikker.db` | Absolute path to the SQLite file |
| `BASE_URL` | `http://localhost:3000` | Public URL shown in admin share links |

---

## How to use

1. Go to `/admin` to create a new interview event with available time slots.
2. The admin page shows two shareable links — one for **students**, one for **entrepreneurs**.
3. Send the correct link to each group.
4. Participants visit their link, enter their name, and tick the slots when they're free.
5. The overview table updates in real time; **green rows = a match** (≥1 student AND ≥1 entrepreneur available at the same time).


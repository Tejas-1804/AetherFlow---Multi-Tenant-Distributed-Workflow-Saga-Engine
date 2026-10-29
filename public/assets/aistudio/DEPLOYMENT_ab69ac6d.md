# Run locally and deploy

## Requirements
- Node.js 22.12+ (recommended Node 22 LTS)
- npm

## Run frontend + backend together on Windows
Open PowerShell in this project folder (the folder containing `package.json`):

```powershell
node -v
npm -v
npm install
Copy-Item .env.example .env -Force
npm run dev
```

Keep the terminal open. Open `http://localhost:3000` on the laptop. On a phone connected to the same Wi-Fi, use `http://YOUR-LAPTOP-LAN-IP:3000` after allowing Node.js through Windows Firewall for private networks. Do not use localhost on the phone; localhost means the phone itself.

Test backend:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

## Demo accounts (local demo only)
- `tejas@acme.com` / `Tejas123!`
- `amaan@cyberdyne.com` / `Amaan123!`
- `priyanka@quantum.io` / `Priyanka123!`
- `rinkle@helios.net` / `Rinkle123!`
- `superadmin@orchestration.engine` / `Admin123!`

Seed accounts already exist, so do not register these email addresses again. Register using a new email. The local data store is `.data/db.json`; back it up before deleting or resetting it.

## Recommended deployment: Vercel frontend + Render backend
This project uses a long-running Express server and WebSockets. Vercel is used for the static React frontend; deploy the backend to a service that supports long-running Node.js processes and WebSockets, such as Render.

### 1. Deploy backend on Render
1. Push the extracted project to a GitHub repository.
2. In Render, choose **New + → Blueprint** and select the repository; Render reads `render.yaml`.
3. After deploy, open `https://YOUR-SERVICE.onrender.com/api/health`. It should return JSON with `status: UP`.
4. Set `CLIENT_URL` in Render to the exact Vercel origin after the frontend is deployed (for example `https://your-project.vercel.app`). To support a Vercel preview origin too, add it comma-separated.
5. The app currently persists data to `.data/db.json`. A free ephemeral host may reset that file on restart/redeploy. For persistent production data, attach a persistent disk at the correct path or replace the JSON store with a managed database. Demo seed credentials are not suitable for production; configure a unique secret and remove/replace demo accounts before real use.

### 2. Deploy frontend on Vercel
1. In Vercel, **Add New → Project**, import the same GitHub repository.
2. Keep the root directory at the project root. Vercel uses `vercel.json` to build `dist`.
3. In Project Settings → Environment Variables, add:
   - `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com/api`
   - `VITE_WS_URL` = `wss://YOUR-SERVICE.onrender.com/ws`
4. Deploy/redeploy. Open the Vercel URL on desktop and mobile.

### 3. Verify authentication
- `GET https://YOUR-SERVICE.onrender.com/api/health` returns `status: UP`.
- Register with a brand-new email, a password of at least 6 characters, and an organization name.
- The registration endpoint should return HTTP 201, store the token, and open the dashboard.
- Sign out and sign in with that same email/password.
- Try a seeded demo account only on a fresh/local demo deployment.

## Common Windows errors
- `Test-Path .\package.json` is `False`: you are in the wrong directory; `cd` into the folder that contains `package.json`.
- `tsx` or a package missing: run `npm install` and inspect the first npm error.
- `EADDRINUSE`: another process uses port 3000. Stop it or set `PORT=3001` in `.env`.
- `User with this email already exists`: use login for that email, or register with a different email.
- `Network Error` on Vercel: confirm the two `VITE_*` variables, redeploy after changing them, and check the Render health endpoint.
- `401 Invalid email or credentials`: check spelling and password; the demo accounts are only available if the service's database has been seeded.

## Important
The project was patched for configurable API/WebSocket origins and startup environment loading. Dependency installation could not be completed in the authoring environment because package download timed out, so run `npm install`, `npm run check`, and `npm run build` locally before relying on deployment. A live Vercel URL cannot be created from this chat because access to your GitHub/Vercel/Render accounts is required.

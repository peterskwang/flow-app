# FLOW App

> Ski app connecting to FLOW smart goggles — group intercom, live GPS map, and SOS alerts.

**Repo:** https://github.com/peterskwang/flow-app  
**Stack:** Expo (React Native) · Node.js · PostgreSQL · Next.js admin  
**Status:** Phase 4 complete ✅

---

## What's Built

| Feature | Status |
|---|---|
| User registration (device-based, no password) | ✅ |
| Group creation + invite code sharing | ✅ |
| Join group by 6-char invite code | ✅ |
| Live GPS tracking + teammate map | ✅ |
| Push-to-talk group intercom (WebSocket) | ✅ |
| SOS alert — broadcasts to group + push notification | ✅ |
| Background GPS (always-on mode) | ✅ |
| Push notifications (Expo Push API) | ✅ |
| BLE audio bridge (FLOW goggles integration) | ✅ |
| iPod simulator tab (test BLE without hardware) | ✅ |
| Admin panel (Next.js) — users, groups, SOS log | ✅ |

---

## Architecture

```
/opt/flow-app/
├── backend/          Node.js + Express + WebSocket (port 8100)
├── frontend/         Expo React Native app (iOS + Android)
├── admin/            Next.js admin dashboard (port 8101)
├── migrations/       PostgreSQL SQL migration files
└── docs/             Testing manuals + Argus review notes
```

**Database:** PostgreSQL — isolated `flow_app` DB, separate from all other projects.

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- [Expo Go](https://expo.dev/go) on your phone (iOS or Android)
- `npm install -g expo-cli` (optional but helpful)

---

### 1. Clone the repo

```bash
git clone https://github.com/peterskwang/flow-app.git
cd flow-app
```

---

### 2. Set up PostgreSQL

```bash
# Create DB + user
psql -U postgres -c "CREATE USER flow_user WITH PASSWORD 'yourpassword';"
psql -U postgres -c "CREATE DATABASE flow_app OWNER flow_user;"

# Run migrations in order
psql -U flow_user -d flow_app -f backend/migrations/001_initial.sql
psql -U flow_user -d flow_app -f backend/migrations/002_phase3.sql
psql -U flow_user -d flow_app -f backend/migrations/003_push_tokens.sql
```

---

### 3. Backend

```bash
cd backend
npm install

# Copy and fill in env vars
cp .env.example .env
# Edit .env — see Environment Variables section below

npm run dev
# → Running on http://localhost:8100
# → WebSocket on ws://localhost:8100/ws
```

**Verify:** `curl http://localhost:8100/health` → `{"status":"ok","project":"flow-app"}`

---

### 4. Frontend (Mobile App)

```bash
cd frontend
npm install

# Set your backend URL
echo 'EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:8100' > .env

npx expo start
```

> **Important:** Use your machine's local IP (e.g. `192.168.1.x`), not `localhost` — the phone needs to reach your machine over the network.

Scan the QR code with:
- **iOS:** Camera app
- **Android:** Expo Go app

---

### 5. Admin Panel

```bash
cd admin
npm install

# Set backend URL
echo 'NEXT_PUBLIC_API_URL=http://localhost:8100' > .env.local
echo 'NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password' >> .env.local

npm run dev
# → Running on http://localhost:8101
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=8100
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flow_app
DB_USER=flow_user
DB_PASS=yourpassword

# JWT — use a long random string
JWT_SECRET=change_me_to_something_long_and_random
JWT_EXPIRES_IN=30d

# Admin panel password
ADMIN_PASSWORD=your_admin_password

# Gaode Maps (optional — map tiles won't render without this)
# Get a key at: https://lbs.amap.com/
GAODE_API_KEY=
```

### Frontend (`frontend/.env`)

```env
# Point to your backend — use local IP, not localhost
EXPO_PUBLIC_API_URL=http://192.168.1.x:8100
```

### Admin (`admin/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8100
NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password
```

---

## App Screens

| Screen | What to test |
|---|---|
| **Registration** | Enter name → tap Join → lands on Map |
| **Map** | GPS coordinates appear, teammate list updates every 10s, long-press SOS button 1.5s |
| **Intercom** | Hold blue button to talk, release to broadcast — needs 2 devices to test audio |
| **SOS** | Long-press red button → confirm dialog → teammates receive alert popup |
| **iPod** | Tap "Start Advertising" → pair from Settings → test BLE audio bridge |
| **Settings** | Edit name, always-on GPS toggle, BLE scan (native build only), leave group |

### ⚠️ Expo Go Limitations

| Feature | Expo Go | Native Build (`expo run:ios/android`) |
|---|---|---|
| All screens | ✅ | ✅ |
| PTT Intercom | ✅ | ✅ |
| GPS + SOS | ✅ | ✅ |
| Push notifications | ✅ | ✅ |
| Background GPS | ✅ | ✅ |
| **Real BLE pairing** | ❌ | ✅ |

> Real BLE pairing (Settings → Scan for Devices) requires a native build. Everything else runs in Expo Go.
>
> For a native build: `cd frontend && npx expo run:ios` (requires Xcode on Mac)

---

## API Reference

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register/login by device_id + name |
| POST | `/api/auth/push-token` | Register Expo push token |

### Groups
| Method | Route | Description |
|---|---|---|
| POST | `/api/groups` | Create a group (returns invite_code) |
| POST | `/api/groups/join` | Join by invite_code |
| GET | `/api/groups/mine` | List my groups |
| POST | `/api/groups/:id/leave` | Leave a group |

### Location
| Method | Route | Description |
|---|---|---|
| POST | `/api/locations` | Push my location |
| GET | `/api/locations/:groupId` | Get all teammate locations |

### SOS
| Method | Route | Description |
|---|---|---|
| POST | `/api/sos` | Trigger SOS alert |
| PATCH | `/api/sos/:id/resolve` | Resolve SOS |

### Admin (requires `X-Admin-Password` header)
| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/groups` | List all groups |
| GET | `/api/admin/sos` | Last 100 SOS events |
| POST | `/api/admin/users/:id/ban` | Ban a user |
| DELETE | `/api/admin/groups/:id` | Delete a group |

### WebSocket (`ws://host/ws?userId=&groupId=&name=`)

Events the server sends:
- `member_joined` / `member_left`
- `ptt_start` / `ptt_end`
- `audio_chunk` — base64 encoded audio
- `location` — teammate GPS update
- `sos_alert` — SOS triggered by group member
- `sos_resolved`

---

## Database Schema

```sql
users          — id (UUID), device_id, name, created_at, banned_at
groups         — id, name, invite_code (6 char), owner_id, max_members (20), closed_at
group_members  — group_id, user_id, joined_at
locations      — user_id (PK upsert), group_id, lat, lng, updated_at
sos_events     — id, user_id, group_id, lat, lng, triggered_at, resolved_at, resolved_by
push_tokens    — user_id (PK upsert), token (ExponentPushToken[...]), platform, updated_at
```

---

## Production Deployment (VPS)

The app is deployed on a VPS at `5.223.73.76` and managed with PM2:

```bash
pm2 list
# flow-backend    port 8100   ← API + WebSocket
# flow-frontend               ← Expo dev server
# flow-admin      port 8101   ← Admin panel
```

To deploy an update:
```bash
cd /opt/flow-app
git pull origin main
cd backend && npm install
pm2 restart flow-backend
cd ../admin && npm install && npm run build
pm2 restart flow-admin
```

---

## Known Gaps (future phases)

- [ ] Map tiles — Gaode API key needed (`GAODE_API_KEY` in backend `.env`)
- [ ] Real BLE pairing requires native build (not Expo Go)
- [ ] WS auto-reconnect on network drop
- [ ] SOS resolve flow visible to users (currently admin-only)
- [ ] HTTPS / custom domain for `flow.peterskwang.com`

---

## GitHub Issues

All features tracked at: https://github.com/peterskwang/flow-app/issues

Phase milestones:
- [Phase 1 — Foundation](https://github.com/peterskwang/flow-app/issues/2)
- [Phase 2 — Core Features](https://github.com/peterskwang/flow-app/issues/3)
- [Phase 3 — Safety + BLE](https://github.com/peterskwang/flow-app/issues/4)
- Phase 4 — Group UI (#14), Push Notifications (#13), Background GPS (#15), Admin Panel (#16)

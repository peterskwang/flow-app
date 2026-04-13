# FLOW App

Ski app connecting to FLOW smart goggles — group intercom, GPS map, SOS alerts.

## Architecture

- **Frontend:** Expo (React Native) — iOS + Android
- **Backend:** Node.js + Express + WebSocket (`/opt/flow-app/backend/`)
- **Admin:** Next.js web panel (`/opt/flow-app/admin/`)
- **Database:** PostgreSQL `flow_app` (isolated, separate from all other projects)

## VPS Isolation

| Item | Value |
|------|-------|
| Directory | `/opt/flow-app/` |
| API Port | `8100` |
| WebSocket Port | `8101` |
| Database | PostgreSQL `flow_app` |
| DB User | `flow_user` |
| PM2 Process | `flow-backend` |
| Nginx vhost | `flow.peterskwang.com` (TBD) |

**Existing projects NOT touched:** fx-breakout-agency, mochi-ai, apex-workspace, mission-control.

## Phases

- [Phase 1](https://github.com/peterskwang/flow-app/issues/2) — Foundation
- [Phase 2](https://github.com/peterskwang/flow-app/issues/3) — Core Features
- [Phase 3](https://github.com/peterskwang/flow-app/issues/4) — Safety + BT Simulation

## Local Dev

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npx expo start

# Admin
cd admin && npm install && npm run dev
```

## Environment

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

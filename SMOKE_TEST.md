# FLOW App — Pre-Release Smoke Test

**This checklist must be completed before any demo or release build is sent to external testers.**

Argus gate: if a PR or release does not include a completed smoke test section → **Request Changes, do not approve**.

---

## 🔴 P0 — Must pass before any demo ships

### Intercom
- [ ] Open Intercom tab → status shows **"Connected to group intercom"** within 5s (never stuck on "Connecting...")
- [ ] PTT button is **enabled and tappable** (not greyed out)
- [ ] Hold PTT on Phone A → Phone B hears voice audio within ~2s
- [ ] Release PTT → channel shows clear, "Now Talking" resets

### iPod / AirPod
- [ ] Tap "Start Advertising" → status changes to "Advertising FLOW service"
- [ ] From Settings, scan + pair → iPod screen shows "Paired with FLOW app"
- [ ] Hold "HOLD TO TALK" → **no microphone error**, recording indicator visible
- [ ] Release → audio plays on paired side

### Map
- [ ] GPS blue dot appears on map within 10s of opening
- [ ] On second device (same group): teammate marker visible within 30s

### SOS
- [ ] Hold SOS button → confirmation dialog appears
- [ ] Confirm → alert appears in admin panel at `/sos`

### Settings / Auth
- [ ] Enter userId, groupId, display name → tap Save → values persist after app restart
- [ ] Join group by code → user appears in admin panel group member list

---

## 🟡 P1 — Must pass before production release

- [ ] Tested on **both iOS and Android**
- [ ] Background GPS continues broadcasting when app is minimised
- [ ] Fresh install (no cached data) → no crash on first launch
- [ ] AirPods connected → intercom audio routes through earphones correctly
- [ ] Two-phone full round-trip: both users can PTT and hear each other bidirectionally

---

## How to Run

1. Use two physical devices (simulator cannot test audio or BLE)
2. Both devices: Settings → enter the **same groupId**, different userId + display name → Save
3. Work through P0 checklist top to bottom, tick each item
4. Screenshot or screen-record any failures for the bug report

## Argus Enforcement

For any PR that ships frontend or audio changes:

1. Does the PR description include a smoke test section with all P0 items checked? → If not, **Request Changes**
2. Were both iOS and Android tested? → If only one platform, flag in review
3. Does the PR description describe *how* the fix was verified (not just "should work now")? → If not, **Request Changes**

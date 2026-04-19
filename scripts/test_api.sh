#!/usr/bin/env bash
# FLOW App — Integration Test Suite
# Tests all Phase 1-3 endpoints against the live local API
# Usage: bash scripts/test_api.sh

BASE="http://localhost:8100/api"
ADMIN_PASS="${ADMIN_PASSWORD:-$(grep ADMIN_PASSWORD /opt/flow-app/backend/.env | cut -d= -f2)}"

PASS=0; FAIL=0

check() {
  local name="$1"; local expected="$2"; local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ $name"
    ((PASS++))
  else
    echo "  ❌ $name"
    echo "     expected: $expected"
    echo "     got:      $actual"
    ((FAIL++))
  fi
}

echo ""
echo "═══════════════════════════════════════"
echo " FLOW API Integration Tests"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"

# ── Auth ─────────────────────────────────
echo ""
echo "── Auth ──────────────────────────────"

# Register Alice
ALICE=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"alice_test_'"$$"'","name":"Alice"}')
ALICE_TOKEN=$(echo "$ALICE" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])" 2>/dev/null)
check "Alice registers" '"token"' "$ALICE"

# Register Bob
BOB=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"bob_test_'"$$"'","name":"Bob"}')
BOB_TOKEN=$(echo "$BOB" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])" 2>/dev/null)
BOB_ID=$(echo "$BOB" | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)
check "Bob registers" '"token"' "$BOB"

# No token → 401
NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/groups/mine")
check "No token → 401" "401" "$NO_AUTH"

# ── Groups ───────────────────────────────
echo ""
echo "── Groups ────────────────────────────"

# Alice creates group
GROUP=$(curl -s -X POST "$BASE/groups" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Snow Crew"}')
GROUP_ID=$(echo "$GROUP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null)
INVITE=$(echo "$GROUP" | python3 -c "import json,sys; print(json.load(sys.stdin)['invite_code'])" 2>/dev/null)
check "Alice creates group" '"invite_code"' "$GROUP"

# Bob joins via invite code
JOIN=$(curl -s -X POST "$BASE/groups/join" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"invite_code\":\"$INVITE\"}")
check "Bob joins group" '"invite_code"' "$JOIN"

# Alice sees her groups
MINE=$(curl -s "$BASE/groups/mine" \
  -H "Authorization: Bearer $ALICE_TOKEN")
check "Alice lists her groups" '"Snow Crew"' "$MINE"

# ── SOS ──────────────────────────────────
echo ""
echo "── SOS ───────────────────────────────"

# Alice triggers SOS
SOS=$(curl -s -X POST "$BASE/sos" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":\"$GROUP_ID\",\"lat\":46.5197,\"lng\":6.6323}")
SOS_ID=$(echo "$SOS" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null)
check "Alice triggers SOS" '"triggered_at"' "$SOS"

# Bob resolves SOS (PATCH, returns the updated event)
RESOLVE=$(curl -s -X PATCH "$BASE/sos/$SOS_ID/resolve" \
  -H "Authorization: Bearer $BOB_TOKEN")
check "Bob resolves SOS" '"resolved_at"' "$RESOLVE"

# ── Admin ─────────────────────────────────
echo ""
echo "── Admin ─────────────────────────────"

# Wrong password → 401
WRONG=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/users" \
  -H "x-admin-password: wrongpassword")
check "Wrong admin pass → 401" "401" "$WRONG"

# List groups
ADMIN_GROUPS=$(curl -s "$BASE/admin/groups" \
  -H "x-admin-password: $ADMIN_PASS")
check "Admin lists groups" '"member_count"' "$ADMIN_GROUPS"

# Admin SOS log
ADMIN_SOS=$(curl -s "$BASE/admin/sos" \
  -H "x-admin-password: $ADMIN_PASS")
check "Admin views SOS log" '"triggered_at"' "$ADMIN_SOS"

# Ban Bob
BAN=$(curl -s -X POST "$BASE/admin/users/$BOB_ID/ban" \
  -H "x-admin-password: $ADMIN_PASS")
check "Admin bans Bob" '"ok":true' "$BAN"

# Banned Bob hits API → 403
BANNED_HIT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/groups/mine" \
  -H "Authorization: Bearer $BOB_TOKEN")
check "Banned Bob → 403" "403" "$BANNED_HIT"

# ── Cleanup ───────────────────────────────
echo ""
echo "── Cleanup ───────────────────────────"
DEL=$(curl -s -X DELETE "$BASE/admin/groups/$GROUP_ID" \
  -H "x-admin-password: $ADMIN_PASS")
check "Admin deletes test group" '"ok":true' "$DEL"

# Clean up test users from DB
PGPASSWORD=flow_secure_2026 psql -U flow_user -d flow_app -h 127.0.0.1 \
  -c "DELETE FROM users WHERE device_id LIKE '%_test_$$'" > /dev/null 2>&1
echo "  🧹 Test users cleaned from DB"

# ── Summary ───────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo " 🎉 All tests passed!"
else
  echo " ⚠️  $FAIL test(s) failed — check above"
fi
echo "═══════════════════════════════════════"
echo ""
exit $FAIL

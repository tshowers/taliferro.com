#!/usr/bin/env bash
set -euo pipefail

# Runs static-browse.js on k6 Cloud once, at that day's VU target, then
# advances the day counter for tomorrow's cron run. Day 1 = 100 VUs, day 2 =
# 200, ... day 7 = 700, then stays at 700 (edit MAX_DAY / STEP to change the
# curve). Requires `k6 cloud login` to have been run once already.

cd "$(dirname "${BASH_SOURCE[0]}")"

STATE_FILE=".loadtest-day"
STEP=100
MAX_DAY=7
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

DAY=$(cat "$STATE_FILE" 2>/dev/null || echo 1)
[ "$DAY" -gt "$MAX_DAY" ] && DAY=$MAX_DAY

VUS=$((DAY * STEP))
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "Day $DAY of $MAX_DAY — running static-browse.js at $VUS VUs"

TARGET_VUS=$VUS k6 cloud run static-browse.js \
  > "$LOG_DIR/day${DAY}-${TIMESTAMP}.log" 2>&1

echo $((DAY + 1)) > "$STATE_FILE"

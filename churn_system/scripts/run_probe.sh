#!/usr/bin/env bash
# Start backend + preview, then run a probe script from the frontend dir.
# Usage: bash churn_system/scripts/run_probe.sh <probe-script.mjs>
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/../backend"
python -m uvicorn app.main:app --port 8000 > /tmp/pb.log 2>&1 &
B1=$!
trap 'kill $B1 $B2 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s --max-time 2 localhost:8000/api/health >/dev/null 2>&1 && break; sleep 1; done

cd "$ROOT/../frontend"
npx vite preview --port 4173 > /tmp/pf.log 2>&1 &
B2=$!
for i in $(seq 1 20); do curl -s --max-time 2 localhost:4173 >/dev/null 2>&1 && break; sleep 1; done

node "$1"

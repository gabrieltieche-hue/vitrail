#!/usr/bin/env bash
# Superviseur du service local Vitrail.
#
# Why this file exists
# --------------------
# proot runs with --kill-on-exit: when the session's main process ends,
# proot kills every process of the session. The Vitrail service (lyrics
# transcription, shared family queue, statistics) must therefore live inside
# the opencode proot session, and be restarted if it dies.
#
# This loop lives in the session (started by oc-session.sh) and relaunches the
# service whenever /api/health stops answering.
#
# No secret in this file.

LOG=/tmp/opencode/vitrail-service.log
SERVER=/root/vitrail/server/service.sh
PORT=8099

mkdir -p /tmp/opencode

while true; do
  if ! curl -sf -m 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "$(date -u '+%F %T') service absent, redemarrage" >> "$LOG"
    bash "$SERVER" start >> "$LOG" 2>&1
  fi
  sleep 20
done

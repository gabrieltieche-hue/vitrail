#!/usr/bin/env bash
# Démarre (ou redémarre) le service local Vitrail.
# Ne jamais utiliser `pkill -f "node server.js"` : le motif matche le shell
# appelant et le tue. On filtre donc sur la ligne de commande exacte.
set -u

DIR=${VITRAIL_SERVER_DIR:-/root/vitrail/server}
LEGACY=/root/vitrail-server/server.js
LOG=/tmp/opencode/vitrail-server.log
PIDFILE=/tmp/opencode/vitrail-server.pid

stop() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid=$(cat "$PIDFILE" 2>/dev/null || echo "")
    if [[ -n "$pid" && -d "/proc/$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PIDFILE"
  fi

  # Instances orphelines. On s'appuie sur /proc/<pid>/exe pour savoir que
  # c'est bien node (ou rclone), et on lit la ligne de commande telle quelle.
  # (Un `read -a` sur /proc/.../cmdline renvoie 1 en fin de fichier : c'est
  # pour ça qu'on ne l'utilise pas ici.)
  local pid exe cmd
  for pid in $(ls /proc 2>/dev/null | grep -E "^[0-9]+$"); do
    [[ "$pid" == "$$" || "$pid" == "$PPID" ]] && continue
    [[ -r "/proc/$pid/cmdline" ]] || continue
    exe=$(readlink "/proc/$pid/exe" 2>/dev/null || echo "")
    cmd=$(tr "\0" " " < "/proc/$pid/cmdline" 2>/dev/null || echo "")
    case "$(basename "${exe:-}")" in
      node)
        case "$cmd" in
          *vitrail*server.js*|*vitrail*server.cjs*) kill "$pid" 2>/dev/null || true ;;
        esac
        ;;
      rclone)
        # Le serveur rclone (source du Drive) doit mourir avec le service,
        # sinon le port 8091 reste occupé au redémarrage.
        case "$cmd" in
          *serve*8091*) kill "$pid" 2>/dev/null || true ;;
        esac
        ;;
    esac
  done
  sleep 1
}

start() {
  cd "$DIR" || exit 1
  setsid node "$DIR/server.js" >"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  sleep 2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:8099/api/health || echo 000)
  if [[ "$code" == "200" ]]; then
    echo "[vitrail] service démarré (pid $(cat "$PIDFILE"))"
    curl -s -m 5 http://127.0.0.1:8099/api/health
    echo
  else
    echo "[vitrail] ÉCHEC du démarrage (code $code) — voir $LOG" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
}

case "${1:-restart}" in
  stop) stop ;;
  start) start ;;
  restart) stop; start ;;
  status) curl -s -m 5 http://127.0.0.1:8099/api/health; echo ;;
  *) echo "usage: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac

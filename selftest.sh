#!/usr/bin/env bash
# Serve the folder, open index.html#selftest in a headless browser, look for SELFTEST PASS.
# Browser: $CHROME if set, else chromium/chrome on PATH, else Playwright's cached headless shell.
set -uo pipefail
cd "$(dirname "$0")"
find_browser() {
  [ -n "${CHROME:-}" ] && { echo "$CHROME"; return; }
  for b in chromium chromium-browser google-chrome google-chrome-stable; do
    command -v "$b" >/dev/null && { command -v "$b"; return; }
  done
  ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | sort -V | tail -1
}
browser=$(find_browser)
[ -n "$browser" ] || { echo "SELFTEST FAIL: no headless browser (set CHROME=/path/to/chrome)"; exit 1; }
port=$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -I -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 0.5
dom=$("$browser" --headless --no-sandbox --disable-gpu --virtual-time-budget=5000 \
      --dump-dom "http://127.0.0.1:$port/index.html#selftest" 2>/dev/null)
result=$(printf '%s' "$dom" | python3 -I -c '
import html, re, sys
m = re.search(r"<pre id=\"selftest\"[^>]*>(.*?)</pre>", sys.stdin.read(), re.S)
print(html.unescape(m.group(1)) if m else "")')
case "$result" in
  "SELFTEST PASS"*) echo "$result"; exit 0 ;;
  "") echo "SELFTEST FAIL: page produced no self-test output"; exit 1 ;;
  *) echo "$result"; exit 1 ;;
esac

#!/usr/bin/env bash
# Serve the game locally. It needs a server (ES modules and fetch do not work from file://).
cd "$(dirname "$0")" && echo "http://localhost:${1:-8000}/" && exec python3 -m http.server "${1:-8000}"

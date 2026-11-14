#!/usr/bin/env bash
# One-command start (Termux / Linux).
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { command -v pkg >/dev/null 2>&1 && pkg install -y nodejs || { echo "Install Node.js 20+ first"; exit 1; }; }
[ -d node_modules ] || npm install --no-audit --no-fund
if [ ! -f .env ] || ! grep -q "^GEMINI_API_KEY=." .env; then
  printf "Gemini API key (aistudio.google.com, free) - press Enter to skip: "
  read -r k
  [ -n "$k" ] && echo "GEMINI_API_KEY=$k" >> .env
fi
( sleep 4; command -v termux-open-url >/dev/null 2>&1 && termux-open-url "http://localhost:3000/app" ) &
node server.js

#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${AI_CREATOR_OS_REPO_URL:-https://github.com/guamee16888/yingtui-affiliate-system.git}"
TARGET_DIR="${1:-$HOME/Guamee/projects/ai-creator-os}"
NODE_MAJOR_MIN="${AI_CREATOR_OS_NODE_MAJOR_MIN:-20}"

log() {
  printf '\n==> %s\n' "$*"
}

need_command() {
  command -v "$1" >/dev/null 2>&1
}

log "AI Creator OS bootstrap"
printf 'Target: %s\n' "$TARGET_DIR"
printf 'Repo:   %s\n' "$REPO_URL"

if ! need_command git; then
  echo "git is missing. Install Xcode Command Line Tools first:"
  echo "xcode-select --install"
  exit 1
fi

if ! need_command brew; then
  echo "Homebrew is missing. Install it from https://brew.sh, then rerun this script."
  exit 1
fi

if ! need_command node; then
  log "Installing Node.js with Homebrew"
  brew install node
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt "$NODE_MAJOR_MIN" ]; then
  echo "Node.js is too old: $(node -v). Need major >= $NODE_MAJOR_MIN."
  echo "Upgrade with: brew upgrade node"
  exit 1
fi

mkdir -p "$(dirname "$TARGET_DIR")"
if [ ! -d "$TARGET_DIR/.git" ]; then
  log "Cloning repository"
  git clone "$REPO_URL" "$TARGET_DIR"
else
  log "Repository already exists, pulling latest"
  git -C "$TARGET_DIR" pull --ff-only
fi

cd "$TARGET_DIR"

log "Installing npm dependencies"
npm install

log "Running core checks"
npm run check
npm test

log "Building and installing the Mac desktop app"
npm run desktop:pack:dir
npm run desktop:install:mac

cat <<EOF

AI Creator OS is ready.

Open:
  /Applications/AI Creator OS.app

Desktop runtime data lives at:
  ~/Library/Application Support/AI Creator OS/

If you exported a migration package from the old Mac, restore the runtime data
before opening the app for the first time on the new Mac.
EOF

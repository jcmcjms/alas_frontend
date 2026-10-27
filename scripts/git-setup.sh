#!/usr/bin/env bash
# Re-applies git push configuration for the ALAS v3 repo.
# Run this after any sandbox restart (.git/config is not persisted):
#   bash scripts/git-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git branch -M main
git remote get-url origin >/dev/null 2>&1 \
  || git remote add origin https://github.com/jcmcjms/alas_frontend.git
git config user.name "jcmcjms"
git config user.email "jcmcjms@users.noreply.github.com"
# Push the HTTPS remote over SSH using the workspace deploy key.
git config --local url."git@github.com:".insteadOf "https://github.com/"
git config core.sshCommand 'ssh -i "$ARENA_WORKSPACE"/.ssh/id_ed25519_alas -o UserKnownHostsFile="$ARENA_WORKSPACE"/.ssh/known_hosts -o IdentitiesOnly=yes -o BatchMode=yes'

echo "Configured. Test with: git ls-remote origin"
echo "Public key (add to GitHub repo → Settings → Deploy keys → allow write):"
cat "$ARENA_WORKSPACE"/.ssh/id_ed25519_alas.pub

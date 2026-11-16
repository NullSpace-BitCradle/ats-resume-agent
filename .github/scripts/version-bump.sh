#!/usr/bin/env bash
# Fails when the files a plugin install ships (agents/, tools/, templates/)
# changed since the last release tag but .claude-plugin/plugin.json still has
# that release's version. Installed users only get changes through
# `/plugin marketplace update` when the version moves.
#
# Usage: .github/scripts/version-bump.sh [base-ref]
# The base defaults to the most recent tag reachable from HEAD. CI needs the
# full history and tags (actions/checkout with fetch-depth: 0).
set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  if ! base=$(git describe --tags --abbrev=0 2>/dev/null); then
    echo "No release tag yet, so there is no version to compare against."
    exit 0
  fi
fi

if git diff --quiet "$base" HEAD -- agents tools templates; then
  echo "agents/, tools/ and templates/ are unchanged since $base."
  exit 0
fi

version_of() { sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1; }
old=$(git show "$base:.claude-plugin/plugin.json" | version_of)
new=$(version_of < .claude-plugin/plugin.json)

if [ -z "$new" ]; then
  echo "Could not read a version from .claude-plugin/plugin.json."
  exit 1
fi
if [ "$old" = "$new" ]; then
  echo "agents/, tools/ or templates/ changed since $base, but plugin.json is still version $new:"
  git diff --stat "$base" HEAD -- agents tools templates
  echo "Bump \"version\" in .claude-plugin/plugin.json (and add a CHANGELOG entry) so installed plugins pick up the change."
  exit 1
fi
echo "Shipped files changed since $base and plugin.json moved from ${old:-no version} to $new."

#!/usr/bin/env bash
set -euo pipefail

# scripts/register-copilot-hooks.sh
# Copy a repository's .github/hooks/hooks.json into one or more target repositories
# and optionally commit & push the change. Useful for "registering" Copilot CLI hooks
# in local repositories (Copilot loads hooks from .github/hooks/ in the current working dir).

usage() {
  cat <<'USAGE'
Usage: register-copilot-hooks.sh [OPTIONS] [TARGET_DIR...]

Copies this repository's .github/hooks/hooks.json into TARGET_DIR/.github/hooks/hooks.json.
If --commit is provided the script will stage and commit the change in each target repo.
If --push is provided it will push the commit to origin/<branch> (default: main).

Options:
  -s, --src PATH       Source hooks.json (default: ../.github/hooks/hooks.json relative to script)
  -t, --target DIR     Target repository directory (can be repeated). Defaults to current directory.
  -c, --commit         Commit the copied file in the target repo.
  -p, --push           Push the commit to origin <branch> (requires --commit).
  -b, --branch BRANCH  Branch to push (default: main).
  -h, --help           Show this help message.

Examples:
  # Copy into current repo (no commit)
  scripts/register-copilot-hooks.sh

  # Copy and commit in current repo
  scripts/register-copilot-hooks.sh --commit

  # Copy, commit and push to origin/main
  scripts/register-copilot-hooks.sh --commit --push

  # Copy into multiple repos and commit
  scripts/register-copilot-hooks.sh --commit /path/to/repo1 /path/to/repo2

USAGE
}

SCRIPTDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_SRC="$SCRIPTDIR/../.github/hooks/hooks.json"
SRC="$DEFAULT_SRC"
TARGETS=()
COMMIT=false
PUSH=false
BRANCH="main"

# Default commit message (includes Co-authored-by trailer)
COMMIT_MESSAGE="chore(hooks): add Copilot hooks configuration

Registers Copilot CLI hooks to call the local approval server shim.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

if [ "$#" -eq 0 ]; then
  # default behavior: copy into current directory
  TARGETS+=(".")
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -s|--src)
      SRC="$2"
      shift 2
      ;;
    -t|--target)
      TARGETS+=("$2")
      shift 2
      ;;
    -c|--commit)
      COMMIT=true
      shift
      ;;
    -p|--push)
      PUSH=true
      shift
      ;;
    -b|--branch)
      BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*|--*)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      TARGETS+=("$1")
      shift
      ;;
  esac
done

if [ ! -f "$SRC" ]; then
  echo "Source hooks.json not found: $SRC" >&2
  echo "Ensure you run this script from the repository that contains .github/hooks/hooks.json or pass --src" >&2
  exit 2
fi

for t in "${TARGETS[@]}"; do
  echo "\n--- target: $t ---"
  if [ ! -d "$t" ]; then
    echo "Target does not exist: $t" >&2
    continue
  fi

  DEST_DIR="$t/.github/hooks"
  mkdir -p "$DEST_DIR"
  cp -f "$SRC" "$DEST_DIR/hooks.json"
  chmod 644 "$DEST_DIR/hooks.json"
  echo "Copied $SRC -> $DEST_DIR/hooks.json"

  if [ "$COMMIT" = true ]; then
    if ! git -C "$t" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "Not a git repository: $t" >&2
      continue
    fi

    git -C "$t" add .github/hooks/hooks.json

    # Only commit if there are staged changes
    if git -C "$t" diff --cached --quiet -- .github/hooks/hooks.json; then
      echo "No changes to commit for .github/hooks/hooks.json in $t"
    else
      printf '%s
' "$COMMIT_MESSAGE" | git -C "$t" commit -F -
      echo "Committed hooks.json in $t"

      if [ "$PUSH" = true ]; then
        echo "Pushing to origin/$BRANCH in $t"
        git -C "$t" push origin "$BRANCH" || {
          echo "Push failed for $t; check remote/branch and credentials" >&2
        }
      fi
    fi
  fi
done

echo "\nDone."

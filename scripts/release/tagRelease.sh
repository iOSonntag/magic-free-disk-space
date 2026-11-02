#!/usr/bin/env bash
# Starts a release: tags the commit of main with vX.Y.Z and pushes the tag to origin, where the
# workflow Release builds, signs, notarizes, and publishes it. It refuses a version that is
# malformed, already tagged, or not newer than the latest release tag on origin, and a checkout
# that is not on main, has tracked changes, or differs from origin/main; it asks to type the tag
# before it pushes.
#
# Arguments:
#   X.Y.Z   the version to release
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <X.Y.Z>" >&2
  exit 2
fi
version="$1"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

remote_refs="$(git ls-remote --tags --refs origin)"
remote_tag_names=()
while IFS=$'\t' read -r _object_id ref; do
  if [[ -n "$ref" ]]; then
    remote_tag_names+=("${ref#refs/tags/}")
  fi
done <<<"$remote_refs"

# The decision prints its own error line on a refusal, which then ends this script.
tag="$(bun "$script_dir/decideReleaseTag.ts" "$version" ${remote_tag_names[@]+"${remote_tag_names[@]}"})"

branch="$(git symbolic-ref --quiet --short HEAD)" || branch=""
if [[ "$branch" != "main" ]]; then
  echo "error: HEAD is on ${branch:-a detached commit}, not on main; nothing was tagged" >&2
  exit 1
fi
# Untracked files are not part of the commit the tag names, so only tracked changes refuse.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "error: the checkout has uncommitted changes to tracked files; nothing was tagged" >&2
  exit 1
fi
git fetch --quiet origin main
head_commit="$(git rev-parse HEAD)"
origin_commit="$(git rev-parse refs/remotes/origin/main)"
if [[ "$head_commit" != "$origin_commit" ]]; then
  if git merge-base --is-ancestor HEAD refs/remotes/origin/main; then
    echo "error: main is behind origin/main; pull first, nothing was tagged" >&2
  elif git merge-base --is-ancestor refs/remotes/origin/main HEAD; then
    echo "error: main is ahead of origin/main; push main first, nothing was tagged" >&2
  else
    echo "error: main and origin/main have diverged; nothing was tagged" >&2
  fi
  exit 1
fi
# The decision refused a tag on origin already, so a local one is left from an interrupted run.
if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "error: a local tag $tag exists that origin lacks; delete it with git tag --delete $tag, nothing was tagged" >&2
  exit 1
fi

echo "Commit: $(git log -1 --format='%h %s')"
echo "Tag:    $tag"
printf 'Type %s to push it and publish the release: ' "$tag"
answer=""
IFS= read -r answer || true
if [[ "$answer" != "$tag" ]]; then
  # An empty stdin leaves the prompt without its line break.
  echo
  echo "error: the answer was not $tag; nothing was tagged" >&2
  exit 1
fi

delete_interrupted_tag() {
  git tag --delete "$tag" >/dev/null 2>&1 || true
  echo "error: the push of $tag was interrupted; the local tag is deleted again" >&2
  exit "$1"
}

git tag --annotate "$tag" --message "Magic Free Disk Space $version"
# A Ctrl-C ends bash before the failure branch below runs, so the signal deletes the tag itself.
trap 'delete_interrupted_tag 130' INT
trap 'delete_interrupted_tag 143' TERM
if ! git push origin "refs/tags/$tag"; then
  # A local tag left behind would make the tagging of the next attempt of this version fail.
  git tag --delete "$tag" >/dev/null
  echo "error: the push of $tag to origin failed; the local tag is deleted again, nothing was published" >&2
  exit 1
fi
trap - INT TERM

echo "Pushed $tag. The workflow Release now builds, signs, notarizes, and publishes it (Actions > Release)."

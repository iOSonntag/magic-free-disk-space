#!/usr/bin/env bash
# Rehearses a release: starts the workflow Release on main by hand, which builds, signs, and
# notarizes the app as a release tag does but publishes nothing, waits for the run, and downloads
# its disk image into ~/Downloads/magic-free-disk-space-rehearsal-<run id>.
#
# Arguments:
#   X.Y.Z   optional, the version the rehearsal builds; without it, the workflow's default applies
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [X.Y.Z]" >&2
  exit 2
fi

poll_attempts=12
poll_interval_seconds=5
watch_attempts=3

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
if [[ ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "error: gh names the repository '$repo', which is not of the form owner/name" >&2
  exit 1
fi

find_newest_dispatch_run_id() {
  gh run list --repo "$repo" --workflow release.yml --event workflow_dispatch --branch main \
    --limit 1 --json databaseId --jq '.[0].databaseId // empty'
}

# The run of this dispatch is the first one listed that differs from the newest before it.
previous_run_id="$(find_newest_dispatch_run_id)"

# Without a version, the dispatch sends no input, so the workflow's default stays its only home.
dispatch_arguments=(workflow run release.yml --repo "$repo" --ref main)
if [[ $# -eq 1 ]]; then
  dispatch_arguments+=(-f "version=$1")
fi

dispatch_exit_code=0
dispatch_output="$(gh "${dispatch_arguments[@]}" 2>&1)" || dispatch_exit_code=$?
printf '%s\n' "$dispatch_output"
if [[ $dispatch_exit_code -ne 0 ]]; then
  echo "error: the dispatch of the workflow Release failed (gh exit code $dispatch_exit_code)" >&2
  exit 1
fi

# gh prints the URL of the run only "if available", so the run list is the fallback.
run_id=""
if [[ "$dispatch_output" =~ /actions/runs/([0-9]+) ]]; then
  run_id="${BASH_REMATCH[1]}"
else
  for ((attempt = 1; attempt <= poll_attempts; attempt++)); do
    # The run exists once the dispatch succeeded, so a failed list only means it is not listed yet.
    listed_run_id="$(find_newest_dispatch_run_id)" || listed_run_id=""
    if [[ "$listed_run_id" =~ ^[0-9]+$ && "$listed_run_id" != "$previous_run_id" ]]; then
      run_id="$listed_run_id"
      break
    fi
    if [[ $attempt -lt $poll_attempts ]]; then
      sleep "$poll_interval_seconds"
    fi
  done
fi
if [[ -z "$run_id" ]]; then
  echo "error: no run of the dispatch appeared within $((poll_attempts * poll_interval_seconds)) seconds; find it under Actions > Release" >&2
  exit 1
fi
echo "Watching run $run_id of the workflow Release"

# gh run watch also exits non-zero when its connection to GitHub fails, so the state of the run
# decides; a rerun of this script would start a second build.
for ((watch_attempt = 1; watch_attempt <= watch_attempts; watch_attempt++)); do
  if gh run watch "$run_id" --repo "$repo" --exit-status; then
    break
  fi
  run_state="$(gh run view "$run_id" --repo "$repo" --json status,conclusion --jq '"\(.status) \(.conclusion)"')" || run_state="unknown"
  run_status="${run_state%% *}"
  if [[ "$run_state" == "completed success" ]]; then
    break
  fi
  if [[ "$run_status" == "completed" ]]; then
    echo "error: the rehearsal run $run_id failed; its failed steps: gh run view $run_id --repo $repo --log-failed" >&2
    exit 1
  fi
  if [[ $watch_attempt -eq $watch_attempts ]]; then
    echo "error: the run $run_id is still $run_status after $watch_attempts watches; follow it under Actions > Release or with gh run watch $run_id --repo $repo" >&2
    exit 1
  fi
  echo "The watch of run $run_id stopped while the run is still $run_status; watching it again"
done

download_dir="$HOME/Downloads/magic-free-disk-space-rehearsal-$run_id"
gh run download "$run_id" --repo "$repo" --name dmg --dir "$download_dir"
echo "The rehearsal published nothing. Its disk image lies in $download_dir"

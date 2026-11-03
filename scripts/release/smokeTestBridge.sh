#!/usr/bin/env bash
# Proves that the signed bridge, as the build signs it with Bridge.entitlements, answers a status
# request with status and a scan request with scanned under the hardened runtime on both
# architectures, over a fixture home of some thousands of files, and exits 0.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <bridge path>" >&2
  exit 2
fi
bridge="$1"
if [[ ! -x "$bridge" ]]; then
  echo "error: $bridge is no executable" >&2
  exit 1
fi

run_limit_seconds=600
repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Not under mktemp's default folder: the bridge refuses a home inside the user's temporary folder.
mkdir -p "$repository/app/build"
work="$(mktemp -d "$repository/app/build/bridge-smoke-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT
home="$work/home"
requests="$work/requests.jsonl"
printf '%s\n' '{"kind":"status"}' '{"kind":"scan"}' >"$requests"

# Writes 3,000 small files: an app cache the scan measures without an age rule, and a project
# whose node_modules the project search finds. Old dates make the project count as quiet, so the
# scan offers both.
build_fixture_home() {
  local cache="$home/Library/Caches/smoke-test-cache"
  local project="$home/Projects/smoke-test-project"
  local folder file
  for ((folder = 1; folder <= 30; folder++)); do
    mkdir -p "$cache/part-$folder"
    for ((file = 1; file <= 50; file++)); do
      printf 'cache entry %s of part %s\n' "$file" "$folder" >"$cache/part-$folder/entry-$file.bin"
    done
  done
  mkdir -p "$project/src"
  printf '{"name":"smoke-test-project","private":true}\n' >"$project/package.json"
  printf 'export {};\n' >"$project/src/index.js"
  for ((folder = 1; folder <= 100; folder++)); do
    mkdir -p "$project/node_modules/package-$folder/lib"
    for ((file = 1; file <= 15; file++)); do
      printf 'module.exports = %s;\n' "$file" >"$project/node_modules/package-$folder/lib/file-$file.js"
    done
  done
  find "$home" -exec touch -h -t 202001010000 {} +
}

# Runs the bridge on one architecture with the fixture home and the two requests on stdin, which
# then ends, and writes its output and error output to files. Stops it after the run limit.
# Returns the bridge's exit code.
run_bridge() {
  local arch="$1" output="$2"
  local pid deadline exit_code=0
  HOME="$home" arch "-$arch" "$bridge" <"$requests" >"$output" 2>"$output.stderr" &
  pid=$!
  deadline=$((SECONDS + run_limit_seconds))
  while kill -0 "$pid" 2>/dev/null; do
    if ((SECONDS >= deadline)); then
      echo "The bridge ran longer than $run_limit_seconds s on $arch; stopping it." >&2
      kill -TERM "$pid" 2>/dev/null || true
      sleep 5
      kill -KILL "$pid" 2>/dev/null || true
      break
    fi
    sleep 1
  done
  wait "$pid" || exit_code=$?
  return "$exit_code"
}

# Prints why a run is not exactly a status then a scanned answer with exit code 0, or nothing
# when it is.
describe_failure() {
  local output="$1" exit_code="$2" kinds
  if ! kinds="$(jq -r 'select(.kind != "progress") | .kind' "$output" 2>/dev/null)"; then
    echo "its output is not one JSON object per line (exit code $exit_code)"
    return
  fi
  if [[ "$kinds" != $'status\nscanned' ]]; then
    echo "its answers were [$(tr '\n' ',' <<<"$kinds" | sed 's/,$//')], not [status,scanned] (exit code $exit_code)"
    return
  fi
  if [[ "$exit_code" -ne 0 ]]; then
    echo "it answered status and scanned but exited with code $exit_code"
  fi
}

# Prints the end of a run's output, each line cut to 300 characters, and of its error output.
print_run() {
  local output="$1"
  echo "--- the end of its output:"
  tail -n 40 "$output" | cut -c 1-300 || true
  echo "--- the end of its error output:"
  tail -n 40 "$output.stderr" || true
  echo "---"
}

build_fixture_home
echo "Built a fixture home of $(find "$home" -type f | wc -l | tr -d ' ') files at $home"

failures=0
for arch in arm64 x86_64; do
  output="$work/bridge-$arch.jsonl"
  echo "Running the bridge on $arch: status, then a scan of the fixture home"
  started=$SECONDS
  exit_code=0
  run_bridge "$arch" "$output" || exit_code=$?
  failure="$(describe_failure "$output" "$exit_code")"
  if [[ -n "$failure" ]]; then
    echo "error: on $arch the bridge failed the smoke test: $failure" >&2
    print_run "$output"
    failures=$((failures + 1))
    continue
  fi
  progress_count="$(jq -c 'select(.kind == "progress")' "$output" | wc -l | tr -d ' ')"
  echo "On $arch the bridge answered status and scanned in $((SECONDS - started)) s, with $progress_count progress events."
  if ! jq -e 'select(.kind == "scanned") | tostring | contains("smoke-test-cache")' "$output" >/dev/null; then
    echo "::warning title=Bridge smoke test::On $arch the scanned answer names no item of the fixture home, so the scan may not have read HOME."
  fi
done
if [[ $failures -gt 0 ]]; then
  echo "error: the signed bridge failed the smoke test on $failures of 2 architectures" >&2
  exit 1
fi

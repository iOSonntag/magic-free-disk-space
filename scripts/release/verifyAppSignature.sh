#!/usr/bin/env bash
# Verifies the Developer ID signatures of the built app before it goes to notarization: the bundle
# as a whole, every architecture of every Mach-O file in it, the absence of get-task-allow on every
# architecture of every executable, and the hardened runtime and both architectures on the app's
# executable and the bridge.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <app path>" >&2
  exit 2
fi
app="$1"
if [[ ! -f "$app/Contents/Info.plist" ]]; then
  echo "error: $app is no app bundle" >&2
  exit 1
fi

failures=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "error: $1" >&2
  failures=$((failures + 1))
}

# Fails when an architecture of an executable requests com.apple.security.get-task-allow, which
# notarization refuses.
check_entitlements() {
  local file="$1" arch="$2" entitlements
  # Only stdout holds the entitlements; codesign writes an Executable= line to stderr.
  if ! entitlements="$(codesign -d --entitlements - --xml --architecture "$arch" "$file" 2>"$work/entitlements-errors")"; then
    fail "$file ($arch): cannot read its entitlements: $(cat "$work/entitlements-errors")"
    return
  fi
  if [[ "${entitlements//[[:space:]]/}" == *"<key>com.apple.security.get-task-allow</key><true/>"* ]]; then
    fail "$file ($arch) requests com.apple.security.get-task-allow, which notarization refuses; look at CODE_SIGN_INJECT_BASE_ENTITLEMENTS of the build configuration"
  fi
}

# Checks that each architecture of a Mach-O file carries a Developer ID signature with a secure
# timestamp, as notarization requires, and that no architecture of an executable requests
# com.apple.security.get-task-allow. The second argument is "true" for an executable.
check_signature() {
  local file="$1" is_executable="$2" archs arch details
  if ! archs="$(lipo -archs "$file" 2>&1)"; then
    fail "$file: lipo cannot read its architectures: $archs"
    return
  fi
  for arch in $archs; do
    if ! details="$(codesign -dvv --architecture "$arch" "$file" 2>&1)"; then
      fail "$file ($arch) is not signed: $details"
      continue
    fi
    if [[ "$details" != *"Authority=Developer ID Application:"* ]]; then
      fail "$file ($arch) is not signed with a Developer ID Application certificate"
    fi
    if [[ "$details" != *"Timestamp="* ]]; then
      fail "$file ($arch) carries no secure timestamp"
    fi
    if [[ "$is_executable" == true ]]; then
      check_entitlements "$file" "$arch"
    fi
  done
}

# Checks that an executable holds both architectures, each signed with the hardened runtime.
check_executable() {
  local file="$1" archs arch details
  local flags_pattern='flags=0x[0-9a-f]+\(([^)]*)\)'
  echo "Checking the hardened runtime and the architectures of $file"
  if [[ ! -f "$file" ]]; then
    fail "$file is missing"
    return
  fi
  archs="$(lipo -archs "$file" 2>&1)" || true
  for arch in arm64 x86_64; do
    if [[ " $archs " != *" $arch "* ]]; then
      fail "$file lacks $arch (it holds: $archs)"
      continue
    fi
    details="$(codesign -dvv --architecture "$arch" "$file" 2>&1)" || true
    if [[ ! "$details" =~ $flags_pattern || ",${BASH_REMATCH[1]}," != *",runtime,"* ]]; then
      fail "$file ($arch) is not signed with the hardened runtime"
    fi
  done
}

echo "Verifying the signature of $app"
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dvv "$app" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier|Timestamp)='

echo "Checking the signature of every Mach-O file in $app"
count=0
while IFS= read -r -d '' file; do
  kind="$(file -b "$file")"
  if [[ "$kind" != Mach-O* ]]; then
    continue
  fi
  is_executable=false
  # file -b repeats the path in the line of each architecture, so match the type text, not the bare word.
  if [[ "$kind" == *"Mach-O 64-bit executable"* ]]; then
    is_executable=true
  fi
  count=$((count + 1))
  echo "  ${file#"$app/"}"
  check_signature "$file" "$is_executable"
done < <(find "$app" -type f -print0)
if [[ $count -eq 0 ]]; then
  fail "$app holds no Mach-O file"
fi

executable="$app/Contents/MacOS/$(plutil -extract CFBundleExecutable raw -o - "$app/Contents/Info.plist")"
bridge="$app/Contents/MacOS/magic-free-disk-space-bridge"
check_executable "$executable"
check_executable "$bridge"

if [[ -f "$bridge" ]]; then
  echo "The bridge's identifier and entitlements:"
  codesign -dv "$bridge" 2>&1 | grep '^Identifier='
  codesign -d --entitlements - --xml "$bridge"
  echo
fi

if [[ $failures -gt 0 ]]; then
  echo "error: $failures signature checks of $app failed" >&2
  exit 1
fi
echo "All $count Mach-O files of $app carry a Developer ID signature with a secure timestamp, and no executable requests get-task-allow."

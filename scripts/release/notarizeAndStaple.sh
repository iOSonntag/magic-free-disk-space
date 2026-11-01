#!/usr/bin/env bash
# Submits a file to Apple's notary service, waits for the verdict, prints the notary log unless it
# is Accepted, and staples the ticket to the file that ships. An app is submitted as a zip and
# stapled as the .app; a disk image is submitted and stapled as itself.
#
# The App Store Connect API key comes from the environment:
#   APP_STORE_CONNECT_API_KEY_PATH  the path of the .p8 key file
#   APP_STORE_CONNECT_API_KEY_ID    the key's id
#   APP_STORE_CONNECT_ISSUER_ID     the issuer id of the team's keys
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <file to submit> <file to staple>" >&2
  exit 2
fi
submitted="$1"
stapled="$2"

for name in APP_STORE_CONNECT_API_KEY_PATH APP_STORE_CONNECT_API_KEY_ID APP_STORE_CONNECT_ISSUER_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is empty" >&2
    exit 1
  fi
done
if [[ ! -f "$APP_STORE_CONNECT_API_KEY_PATH" ]]; then
  echo "error: the key file APP_STORE_CONNECT_API_KEY_PATH names does not exist" >&2
  exit 1
fi
for file in "$submitted" "$stapled"; do
  if [[ ! -e "$file" ]]; then
    echo "error: $file does not exist" >&2
    exit 1
  fi
done

credentials=(
  --key "$APP_STORE_CONNECT_API_KEY_PATH"
  --key-id "$APP_STORE_CONNECT_API_KEY_ID"
  --issuer "$APP_STORE_CONNECT_ISSUER_ID"
)

echo "Submitting $submitted for notarization and waiting for the verdict"
exit_code=0
result="$(xcrun notarytool submit "$submitted" "${credentials[@]}" \
  --wait --timeout 30m --output-format json)" || exit_code=$?
echo "$result"

submission_id="$(jq -r '.id // empty' <<<"$result" 2>/dev/null)" || submission_id=""
status="$(jq -r '.status // empty' <<<"$result" 2>/dev/null)" || status=""
if [[ "$status" != "Accepted" ]]; then
  echo "error: the notarization of $submitted ended with the status '${status:-none}' (notarytool exit code $exit_code)" >&2
  if [[ -n "$submission_id" ]]; then
    echo "The notary log of submission $submission_id:"
    xcrun notarytool log "$submission_id" "${credentials[@]}" || true
  fi
  exit 1
fi
echo "Submission $submission_id was accepted."

# The ticket can take a moment to reach Apple's ticket service after the verdict.
for attempt in 1 2 3; do
  echo "Stapling the ticket to $stapled (attempt $attempt)"
  if xcrun stapler staple "$stapled"; then
    break
  fi
  if [[ $attempt -eq 3 ]]; then
    echo "error: stapling $stapled failed three times" >&2
    exit 1
  fi
  sleep 20
done
xcrun stapler validate "$stapled"

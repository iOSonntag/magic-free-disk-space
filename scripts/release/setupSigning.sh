#!/usr/bin/env bash
# Sets up the Developer ID signing of the release workflow, and renews it when the certificate
# expires, so no secret passes through the clipboard.
#
#   request <folder> <email>
#     Creates <folder>, outside every git work tree, with a new private key and the certificate
#     signing request for it, and prints what to fetch from Apple next.
#
#   install <folder> <certificate.cer> <AuthKey_XXXXXXXXXX.p8> <key-id> <issuer-id>
#     Checks the certificate against the folder's key and builds developer-id.p12 with a random
#     password in developer-id.p12.password. Then, on the repository of the current checkout, it
#     sets up the environment `release` with its branch and tag policies, stores the six secrets
#     the release workflow reads, and protects the release tags with the ruleset "Release tags".
#     Only once all of it succeeded does it move the .p8 into the folder and delete the key and the
#     request, so the folder then holds every secret, for the password manager. A failed step leaves
#     every file in place, so a rerun picks up from there.
set -euo pipefail

# ASCII alone, since `openssl req -subj` fails on other bytes and reads `\` and `/` as syntax.
email_pattern='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'
apple_id_pattern='^[A-Z0-9]{10}$'
issuer_id_pattern='^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
repository_pattern='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
script="scripts/release/setupSigning.sh"

exit_with_usage() {
  echo "usage: $0 request <folder> <email>" >&2
  echo "       $0 install <folder> <certificate.cer> <AuthKey_XXXXXXXXXX.p8> <key-id> <issuer-id>" >&2
  exit 2
}

exit_with_error() {
  echo "error: $1" >&2
  exit 1
}

create_signing_request() {
  local folder="$1"
  local email="$2"
  local parent
  parent="$(dirname "$folder")"

  if [[ -e "$folder" ]]; then
    exit_with_error "$folder exists already; name a folder that does not exist yet"
  fi
  if [[ ! -d "$parent" ]]; then
    exit_with_error "the parent folder $parent does not exist"
  fi
  # The private key must never be one `git add` away from a repository.
  if git -C "$parent" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    exit_with_error "$parent lies inside a git work tree; name a folder outside every repository"
  fi
  if [[ ! "$email" =~ $email_pattern ]]; then
    exit_with_error "'$email' is not an email address of ASCII letters, digits, and ._%+-"
  fi

  local absolute_folder
  absolute_folder="$(cd "$parent" && pwd -P)/$(basename "$folder")"
  mkdir -m 0700 "$absolute_folder"
  # OpenSSL 3 reads a bare `+` in -subj as the start of a second value of the same name.
  # A folder left behind would refuse the rerun as existing.
  if ! (umask 077 && openssl req -new -newkey rsa:2048 -nodes \
    -keyout "$absolute_folder/developer-id.key" \
    -out "$absolute_folder/developer-id.certSigningRequest" \
    -subj "/emailAddress=${email//+/\\+}/CN=Developer ID signing key"); then
    rm -rf "$absolute_folder"
    exit_with_error "openssl could not create the key and the request; $absolute_folder is removed again"
  fi

  cat <<EOF

$absolute_folder now holds the private key developer-id.key and the request
developer-id.certSigningRequest. Next:

1. The Account Holder of the team opens
   https://developer.apple.com/account/resources/certificates/add
   chooses "Developer ID Application", picks the Sub-CA G2 when asked, uploads
   developer-id.certSigningRequest, and downloads the certificate (.cer).

2. In App Store Connect › Users and Access › Integrations › App Store Connect API,
   under Team Keys (not an Individual Key), generate a key with Developer access,
   download AuthKey_XXXXXXXXXX.p8 once, and note its key id and the issuer id.

3. From the root of this repository's checkout, run:
   $script install "$absolute_folder" <certificate.cer> <AuthKey_XXXXXXXXXX.p8> <key-id> <issuer-id>
EOF
}

# Sets team_id for the GitHub step, and leaves developer-id.p12 and its password in the folder.
prepare_apple_material() {
  local folder="$1"
  local certificate="$2"
  local api_key="$3"
  local key_id="$4"
  local issuer_id="$5"
  local work="$6"
  local key="$folder/developer-id.key"

  if [[ ! -f "$key" ]]; then
    exit_with_error "$key does not exist; start again with: $script request <folder> <email>"
  fi
  if [[ ! -f "$certificate" ]]; then
    exit_with_error "the certificate $certificate does not exist"
  fi
  if [[ ! -f "$api_key" ]]; then
    exit_with_error "the API key $api_key does not exist"
  fi

  # Apple sends the certificate as DER; one converted before arrives as PEM.
  local certificate_pem="$work/developer-id.pem"
  if ! openssl x509 -inform DER -in "$certificate" -out "$certificate_pem" 2>/dev/null &&
    ! openssl x509 -inform PEM -in "$certificate" -out "$certificate_pem" 2>/dev/null; then
    exit_with_error "$certificate is no certificate in DER or PEM"
  fi

  local certificate_public_key key_public_key
  certificate_public_key="$(openssl x509 -noout -pubkey -in "$certificate_pem")"
  key_public_key="$(openssl pkey -in "$key" -pubout)"
  if [[ "$certificate_public_key" != "$key_public_key" ]]; then
    exit_with_error "$certificate belongs to another key than $key; upload this folder's developer-id.certSigningRequest"
  fi

  local subject common_name organizational_unit
  subject="$(openssl x509 -noout -subject -nameopt multiline -in "$certificate_pem")"
  common_name="$(sed -n 's/^ *commonName *= //p' <<<"$subject")"
  organizational_unit="$(sed -n 's/^ *organizationalUnitName *= //p' <<<"$subject")"
  if [[ "$common_name" != "Developer ID Application: "* || "$common_name" == *$'\n'* ]]; then
    exit_with_error "the certificate is no Developer ID Application certificate: its common name is '$common_name'"
  fi
  if [[ ! "$organizational_unit" =~ $apple_id_pattern ]]; then
    exit_with_error "the certificate's organizational unit '$organizational_unit' is no team id of 10 capital letters and digits"
  fi
  if [[ "$common_name" != *"($organizational_unit)" ]]; then
    exit_with_error "the certificate's common name '$common_name' does not end with its team id ($organizational_unit)"
  fi
  team_id="$organizational_unit"

  if ! grep -q -- '^-----BEGIN PRIVATE KEY-----' "$api_key"; then
    exit_with_error "$api_key holds no private key"
  fi
  if [[ ! "$key_id" =~ $apple_id_pattern ]]; then
    exit_with_error "the key id '$key_id' is not 10 capital letters and digits"
  fi
  if [[ ! "$issuer_id" =~ $issuer_id_pattern ]]; then
    exit_with_error "the issuer id '$issuer_id' is no UUID"
  fi

  local password_file="$folder/developer-id.p12.password"
  # A trailing newline would become part of the secret and break `security import -P`.
  (umask 077 && openssl rand -hex 24 | tr -d '\n' >"$password_file")
  # These options give the legacy p12 that macOS `security import` reads, under LibreSSL and
  # OpenSSL 3 alike; LibreSSL lacks -legacy.
  (umask 077 && openssl pkcs12 -export -inkey "$key" -in "$certificate_pem" \
    -name "Developer ID Application" -out "$folder/developer-id.p12" \
    -passout "file:$password_file" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1)
}

protect_release_on_github() {
  local folder="$1"
  local api_key="$2"
  local team_id="$3"
  local key_id="$4"
  local issuer_id="$5"
  local repo

  repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  if [[ ! "$repo" =~ $repository_pattern ]]; then
    exit_with_error "gh named the repository '$repo', which is no owner/name"
  fi
  echo "Protecting the releases of $repo"

  printf '%s' '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
    gh api --method PUT "repos/$repo/environments/release" --input - >/dev/null

  local release_policies=$'branch main\ntag v*'
  local policies policy policy_type policy_name
  policies="$(gh api "repos/$repo/environments/release/deployment-branch-policies" \
    --jq '.branch_policies[] | "\(.type) \(.name)"')"
  while IFS= read -r policy; do
    if grep -qxF -- "$policy" <<<"$policies"; then
      continue
    fi
    policy_type="${policy%% *}"
    policy_name="${policy#* }"
    # The loop feeds its own stdin, which gh must not read.
    gh api --method POST "repos/$repo/environments/release/deployment-branch-policies" \
      -f "name=$policy_name" -f "type=$policy_type" >/dev/null </dev/null
  done <<<"$release_policies"
  while IFS= read -r policy; do
    if [[ -z "$policy" ]] || grep -qxF -- "$policy" <<<"$release_policies"; then
      continue
    fi
    echo "warning: the environment release also admits $policy; its refs can read the signing secrets too. Remove it under Settings > Environments > release unless intended." >&2
  done <<<"$policies"

  # Each value reaches gh on stdin; printf is a builtin, so no value lands on a process argv.
  local secret_target=(--env release --repo "$repo")
  base64 <"$folder/developer-id.p12" | tr -d '\n' |
    gh secret set DEVELOPER_ID_CERTIFICATE_P12_BASE64 "${secret_target[@]}"
  gh secret set DEVELOPER_ID_CERTIFICATE_PASSWORD "${secret_target[@]}" <"$folder/developer-id.p12.password"
  printf '%s' "$team_id" | gh secret set APPLE_TEAM_ID "${secret_target[@]}"
  gh secret set APP_STORE_CONNECT_API_KEY_P8 "${secret_target[@]}" <"$api_key"
  printf '%s' "$key_id" | gh secret set APP_STORE_CONNECT_API_KEY_ID "${secret_target[@]}"
  printf '%s' "$issuer_id" | gh secret set APP_STORE_CONNECT_ISSUER_ID "${secret_target[@]}"

  local ruleset_id
  ruleset_id="$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "Release tags") | .id')"
  # actor_id 5 is GitHub's repository admin role, which may still move a release tag by hand.
  local ruleset='{"name":"Release tags","target":"tag","enforcement":"active","bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],"conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},"rules":[{"type":"creation"},{"type":"update"},{"type":"deletion"}]}'
  if [[ -z "$ruleset_id" ]]; then
    printf '%s' "$ruleset" | gh api --method POST "repos/$repo/rulesets" --input - >/dev/null
  elif [[ "$ruleset_id" =~ ^[0-9]+$ ]]; then
    printf '%s' "$ruleset" | gh api --method PUT "repos/$repo/rulesets/$ruleset_id" --input - >/dev/null
  else
    exit_with_error "$repo holds more than one ruleset named \"Release tags\"; delete all but one"
  fi
}

install_signing() {
  local folder="$1"
  local certificate="$2"
  local api_key="$3"
  local key_id="$4"
  local issuer_id="$5"

  if [[ ! -d "$folder" ]]; then
    exit_with_error "the folder $folder does not exist; start again with: $script request <folder> <email>"
  fi

  # A global, since the trap runs after this function has returned.
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT

  team_id=""
  prepare_apple_material "$folder" "$certificate" "$api_key" "$key_id" "$issuer_id" "$work"
  protect_release_on_github "$folder" "$api_key" "$team_id" "$key_id" "$issuer_id"

  local api_key_name api_key_folder folder_absolute
  api_key_name="$(basename "$api_key")"
  api_key_folder="$(cd "$(dirname "$api_key")" && pwd -P)"
  folder_absolute="$(cd "$folder" && pwd -P)"
  # The .p8 moves before the key goes, so a failed move leaves what a rerun needs.
  if [[ "$api_key_folder" != "$folder_absolute" ]]; then
    mv -f "$api_key" "$folder_absolute/$api_key_name"
  fi
  rm -f "$folder/developer-id.key" "$folder/developer-id.certSigningRequest"

  cat <<EOF

The signing of the releases is set up. $folder_absolute now holds every secret:
  developer-id.p12
  developer-id.p12.password
  $api_key_name
Store the three files in the password manager, then delete the folder. The certificate
$certificate holds no secret and stays where it is.
EOF
}

if [[ $# -lt 1 ]]; then
  exit_with_usage
fi
case "$1" in
  request)
    if [[ $# -ne 3 ]]; then
      exit_with_usage
    fi
    create_signing_request "$2" "$3"
    ;;
  install)
    if [[ $# -ne 6 ]]; then
      exit_with_usage
    fi
    install_signing "$2" "$3" "$4" "$5" "$6"
    ;;
  *)
    exit_with_usage
    ;;
esac

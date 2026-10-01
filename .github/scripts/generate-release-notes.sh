#!/usr/bin/env bash

set -euo pipefail

version="${1:-}"
target="${2:-HEAD}"
previous_tag="${3:-}"

if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
  echo "Version must be valid SemVer without a v prefix." >&2
  exit 1
fi

version_without_build="${version%%+*}"
if [[ "$version_without_build" == *-* ]]; then
  prerelease="${version_without_build#*-}"
  IFS='.' read -r -a prerelease_identifiers <<< "$prerelease"
  for identifier in "${prerelease_identifiers[@]}"; do
    if [[ "$identifier" =~ ^[0-9]+$ && "$identifier" =~ ^0[0-9]+$ ]]; then
      echo "Numeric prerelease identifiers must not contain leading zeroes." >&2
      exit 1
    fi
  done
fi

git rev-parse --verify "${target}^{commit}" >/dev/null

if [[ -z "$previous_tag" ]]; then
  previous_tag="$(git describe --tags --abbrev=0 "${target}^" 2>/dev/null || true)"
fi

if [[ -n "$previous_tag" ]]; then
  git rev-parse --verify "refs/tags/${previous_tag}^{commit}" >/dev/null
  range="${previous_tag}..${target}"
  comparison="Changes since ${previous_tag}"
else
  range="$target"
  comparison="Initial release history"
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

features="$temporary_directory/features"
fixes="$temporary_directory/fixes"
documentation="$temporary_directory/documentation"
maintenance="$temporary_directory/maintenance"
other="$temporary_directory/other"

touch "$features" "$fixes" "$documentation" "$maintenance" "$other"

while IFS=$'\t' read -r commit subject; do
  [[ -n "$commit" ]] || continue

  case "$subject" in
    feat:*|feat!:*|feat\(*\):*|feat\(*\)!:*) destination="$features" ;;
    fix:*|fix!:*|fix\(*\):*|fix\(*\)!:*) destination="$fixes" ;;
    docs:*|docs!:*|docs\(*\):*|docs\(*\)!:*) destination="$documentation" ;;
    test:*|test!:*|test\(*\):*|test\(*\)!:*|refactor:*|refactor!:*|refactor\(*\):*|refactor\(*\)!:*|chore:*|chore!:*|chore\(*\):*|chore\(*\)!:*|build:*|build!:*|build\(*\):*|build\(*\)!:*|ci:*|ci!:*|ci\(*\):*|ci\(*\)!:*)
      destination="$maintenance"
      ;;
    *) destination="$other" ;;
  esac

  printf -- '- %s (`%s`)\n' "$subject" "$commit" >> "$destination"
done < <(git log --reverse --format='%h%x09%s' "$range")

printf '# JoinSplit v%s\n\n' "$version"
printf '_Generated from `%s` at `%s`._\n' "$comparison" "$(git rev-parse --short "$target")"

write_section() {
  local title="$1"
  local source_file="$2"

  if [[ -s "$source_file" ]]; then
    printf '\n## %s\n\n' "$title"
    cat "$source_file"
  fi
}

write_section "Features" "$features"
write_section "Fixes" "$fixes"
write_section "Documentation" "$documentation"
write_section "Maintenance" "$maintenance"
write_section "Other changes" "$other"

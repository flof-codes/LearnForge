#!/bin/sh
# Substitute runtime configuration into the built web assets, then hand off to
# nginx's own entrypoint.
#
# WHY THIS EXISTS
#
# Vite replaces import.meta.env.* with string LITERALS at build time -- see
# `envPrefix: ['VITE_', 'OPERATOR_']` in web-ui/vite.config.ts. By the time nginx
# serves anything, the values are already frozen into two places:
#
#   * the hashed JS bundles (web-ui/src/api/client.ts, web-ui/src/i18n/index.ts)
#   * the PRERENDERED HTML that web-ui/prerender.mjs writes for /impressum,
#     /datenschutz, /agb, /privacy, /terms and /imprint, via
#     web-ui/src/i18n/server.ts
#
# So the build bakes in placeholder tokens and this script replaces them at
# container start. That is what keeps ONE image usable in every environment
# instead of one image per configuration -- which is most of the reason for
# publishing to a registry at all. It also keeps the operator's postal address
# out of the repository and out of the image history, where a build arg would
# put it.
#
# WHY IT COPIES FROM A PRISTINE TREE INSTEAD OF EDITING IN PLACE
#
# Substituting the serve root directly is a one-way door: after the first start
# there are no placeholders left, so `docker restart` with a changed .env would
# silently keep serving the previous values while looking like it had applied
# them. Copying out of /opt/learnforge/dist every time makes a restart and a
# recreate behave identically.
#
# IT FAILS CLOSED, deliberately. An unset variable exits non-zero rather than
# serving a literal __LF_OPERATOR_ADDRESS__ on a legally required Impressum page.
# A missing value should be a failed health check, not a published defect.

set -eu

PRISTINE=/opt/learnforge/dist
ROOT=/usr/share/nginx/html

# OPERATOR_ADDRESS and VITE_DONATION_URL are the only optional ones, because the
# app already treats an empty address and an absent donation link as valid states
# (web-ui/src/i18n/index.ts defaults the address to '', and PricingSection.tsx
# falls back to '#'). Everything else has a localhost-shaped default in source
# that must never reach a server.
REQUIRED_VARS='VITE_API_URL OPERATOR_NAME OPERATOR_CITY OPERATOR_EMAIL'
OPTIONAL_VARS='VITE_DONATION_URL OPERATOR_ADDRESS'

missing=''
for var in $REQUIRED_VARS; do
    eval "value=\${$var-}"
    if [ -z "$value" ]; then
        missing="$missing $var"
    fi
done
if [ -n "$missing" ]; then
    echo "learnforge-web: refusing to start -- unset required variable(s):$missing" >&2
    echo "learnforge-web: set them in the service's .env; see .env.example" >&2
    exit 1
fi

# The `|| '#'` fallback in web-ui/src/components/public/landing/PricingSection.tsx
# does NOT survive the build. Vite substitutes the placeholder as a literal and
# esbuild then constant-folds `"__LF_VITE_DONATION_URL__" || "#"` down to the
# placeholder alone, so the fallback is gone by the time this script runs and an
# empty value would produce href="" -- which reloads the page instead of doing
# nothing. Reinstate the default here.
VITE_DONATION_URL="${VITE_DONATION_URL:-#}"

# OPERATOR_ADDRESS needs no equivalent: its in-source fallback is '' and an unset
# variable substitutes to '' anyway, so both paths agree.

# Escape the three characters that are special on the REPLACEMENT side of a sed
# s### expression: a backslash, the delimiter, and & (which would expand to the
# whole match). Values legitimately contain spaces -- OPERATOR_ADDRESS is a
# street address -- so the expressions go into a file for `sed -f` rather than
# being assembled into a command line, where word splitting would break them.
sed_escape() {
    printf '%s' "$1" | sed -e 's/[\\&#]/\\&/g'
}

# A literal newline, obtained the roundabout way on purpose: command substitution
# strips TRAILING newlines, so `$(printf '\n')` yields an EMPTY string -- and
# `case $v in *""*)` then matches every value, which made this guard reject
# everything. The trailing x survives the stripping and is removed afterwards.
newline=$(printf '\nx')
newline=${newline%x}

sedfile=$(mktemp)
# shellcheck disable=SC2064
trap "rm -f '$sedfile'" EXIT INT TERM

for var in $REQUIRED_VARS $OPTIONAL_VARS; do
    eval "value=\${$var-}"
    # A newline in a value would silently truncate the sed expression and corrupt
    # every file it touched, so refuse it rather than half-applying it.
    case $value in
    *"$newline"*)
        echo "learnforge-web: refusing to start -- $var contains a newline" >&2
        exit 1
        ;;
    esac
    printf 's#__LF_%s__#%s#g\n' "$var" "$(sed_escape "$value")" >>"$sedfile"
done

# Reset the serve root from the pristine tree. `find -delete` rather than
# `rm -rf "$ROOT"/*` so that dotfile directories (.well-known/) go too.
find "$ROOT" -mindepth 1 -delete
cp -a "$PRISTINE"/. "$ROOT"/

find "$ROOT" -type f \( -name '*.js' -o -name '*.html' \) -exec sed -i -f "$sedfile" {} +

# Catch a placeholder that no longer has a matching variable above -- which is
# what happens when someone adds a new import.meta.env.* usage in web-ui/src and
# forgets this list. Without this check the token would be served verbatim.
leftover=$(grep -rl '__LF_[A-Z0-9_]*__' "$ROOT" 2>/dev/null || true)
if [ -n "$leftover" ]; then
    echo "learnforge-web: refusing to start -- unsubstituted placeholders remain in:" >&2
    printf '%s\n' "$leftover" | head -n 10 >&2
    echo "learnforge-web: add the missing variable to REQUIRED_VARS/OPTIONAL_VARS in docker-entrypoint.sh" >&2
    exit 1
fi

# Hand off to the base image's entrypoint so its own /docker-entrypoint.d/
# handling and signal behaviour are preserved. exec, so nginx is PID 1 and
# receives SIGTERM directly.
exec /docker-entrypoint.sh "$@"

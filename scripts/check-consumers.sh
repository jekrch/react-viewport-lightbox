#!/usr/bin/env bash
# Typecheck and build the consumer apps against THIS working tree, packed the
# way npm would publish it, without touching either app's repo.
#
#   npm run check:consumers                 # plantyJ and comic-snaps
#   npm run check:consumers -- comic-snaps  # just one
#
# Each app is copied (source + config, no node_modules/dist/public) into a temp
# dir whose node_modules links back to the app's own installed packages, except
# @jekrch/react-viewport-lightbox, which is the freshly packed tarball unpacked
# in place. The packed copy sits inside that node_modules so its `react` import
# resolves to the app's single React, like a real install (and unlike
# `npm link`). The apps' own `tsc` and `vite build` then run in the copy.
#
# Consumers are looked up next to this repo; set CONSUMERS_DIR to change that.
# Each app needs its dependencies installed already.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONSUMERS_DIR="${CONSUMERS_DIR:-$(dirname "$ROOT")}"
PKG="@jekrch/react-viewport-lightbox"
if [ "$#" -gt 0 ]; then APPS=("$@"); else APPS=(plantyJ comic-snaps); fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rvl-consumers.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "→ building and packing $PKG"
(cd "$ROOT" && npm run build --silent >/dev/null && npm pack --silent --pack-destination "$WORK" >/dev/null)
TGZ="$(ls "$WORK"/*.tgz)"

failed=()
for app in "${APPS[@]}"; do
  src="$CONSUMERS_DIR/$app"
  dest="$WORK/$app"
  echo
  echo "→ $app"
  if [ ! -d "$src/node_modules" ]; then
    echo "✗ $src/node_modules not found; install the app's dependencies first"
    failed+=("$app")
    continue
  fi

  mkdir -p "$dest"
  # Public assets are skipped (hundreds of MB, and the build only copies them).
  tar -C "$src" \
    --exclude=node_modules --exclude=./dist --exclude=./public --exclude=./coverage \
    --exclude=./.git --exclude=./.claude --exclude='*.tsbuildinfo' \
    -cf - . | tar -C "$dest" -xf -
  mkdir -p "$dest/public"

  # node_modules: links to the app's installed packages, one level down inside
  # scopes so the lightbox's own scope entry can be replaced.
  nm="$dest/node_modules"
  mkdir -p "$nm"
  for entry in "$src"/node_modules/* "$src"/node_modules/.bin; do
    [ -e "$entry" ] || continue
    name="$(basename "$entry")"
    if [[ "$name" == @* ]]; then
      mkdir -p "$nm/$name"
      for sub in "$entry"/*; do
        [ "$name/$(basename "$sub")" = "$PKG" ] && continue
        ln -s "$sub" "$nm/$name/$(basename "$sub")"
      done
    else
      ln -s "$entry" "$nm/$name"
    fi
  done
  mkdir -p "$nm/$PKG"
  tar -xzf "$TGZ" -C "$nm/$PKG" --strip-components=1

  packed="$(node -p "require('$nm/$PKG/package.json').version")"
  installed_pkg="$src/node_modules/$PKG/package.json"
  if [ "$(realpath "$installed_pkg" 2>/dev/null)" = "$(realpath "$ROOT/package.json")" ]; then
    # A linked install's package.json IS this repo's, so its version says nothing.
    echo "  app has this repo linked in; checking against packed $packed"
  else
    installed="$(node -p "require('$installed_pkg').version")"
    echo "  app has $installed installed; checking against packed $packed"
  fi

  if (cd "$dest" && node_modules/.bin/tsc -p tsconfig.json --noEmit); then
    echo "  ✓ typecheck"
  else
    echo "  ✗ typecheck"
    failed+=("$app")
    continue
  fi
  if (cd "$dest" && node_modules/.bin/vite build --logLevel error >/dev/null); then
    echo "  ✓ vite build"
  else
    echo "  ✗ vite build"
    failed+=("$app")
  fi
done

echo
if [ "${#failed[@]}" -gt 0 ]; then
  echo "✗ failed: ${failed[*]}"
  exit 1
fi
echo "✓ all consumers typecheck and build against the working tree"

#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
SOURCE="$PACKAGE_ROOT/bin/qb-trace"
TARGET_DIR="${HOME:?HOME is required}/.local/bin"
TARGET="$TARGET_DIR/qb-trace"

mkdir -p "$TARGET_DIR"
chmod 700 "$TARGET_DIR" 2>/dev/null || true
chmod +x "$SOURCE"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if [ -L "$TARGET" ]; then
    LINK_SOURCE=$(readlink "$TARGET")
    if [ "$LINK_SOURCE" = "$SOURCE" ]; then
      printf 'qb-trace already installed: %s\n' "$TARGET"
    else
      case "$LINK_SOURCE" in
        */pi-plugins/bin/qb-trace)
          TEMP_LINK="${TARGET}.tmp.$$"
          trap 'rm -f "$TEMP_LINK"' 0 HUP INT TERM
          ln -s "$SOURCE" "$TEMP_LINK"
          mv -f "$TEMP_LINK" "$TARGET"
          trap - 0 HUP INT TERM
          printf 'migrated qb-trace: %s -> %s\n' "$TARGET" "$SOURCE"
          ;;
        *)
          printf 'refusing to overwrite non-package target: %s\n' "$TARGET" >&2
          exit 1
          ;;
      esac
    fi
  else
    printf 'refusing to overwrite non-package target: %s\n' "$TARGET" >&2
    exit 1
  fi
else
  ln -s "$SOURCE" "$TARGET"
  printf 'installed qb-trace: %s -> %s\n' "$TARGET" "$SOURCE"
fi

case ":${PATH:-}:" in
  *":$TARGET_DIR:"*) ;;
  *) printf 'warning: add %s to PATH\n' "$TARGET_DIR" >&2 ;;
esac

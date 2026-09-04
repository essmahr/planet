# Sourced by bin/planet and bin/planet-hook. Prints the node binary to use.
# Order: PLANET_NODE override, node on PATH, newest v24 under nvm, newest any under nvm.
# Claude Code's shell and hook processes do not always carry nvm's PATH.
planet_find_node() {
  if [ -n "${PLANET_NODE:-}" ] && [ -x "$PLANET_NODE" ]; then printf '%s' "$PLANET_NODE"; return 0; fi
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}" candidate
  candidate="$(planet_newest_node "$nvm_dir" 'v24.')"
  [ -z "$candidate" ] && candidate="$(planet_newest_node "$nvm_dir" 'v')"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then printf '%s' "$candidate"; return 0; fi
  return 1
}

# Newest nvm node whose version starts with $2, compared numerically, not lexically.
planet_newest_node() {
  ls -d "$1"/versions/node/"$2"*/bin/node 2>/dev/null \
    | sed 's#^\(.*/versions/node/v\([0-9][0-9.]*\)/bin/node\)$#\2 \1#' \
    | sort -t. -k1,1n -k2,2n -k3,3n \
    | tail -n 1 \
    | cut -d' ' -f2-
}

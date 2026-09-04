# Sourced by bin/planet and bin/planet-hook. Prints the node binary to use.
# Order: PLANET_NODE override, node on PATH, newest v24 under nvm, newest any under nvm.
# Claude Code's shell and hook processes do not always carry nvm's PATH.
planet_find_node() {
  if [ -n "${PLANET_NODE:-}" ] && [ -x "$PLANET_NODE" ]; then printf '%s' "$PLANET_NODE"; return 0; fi
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}" candidate
  candidate="$(ls -d "$nvm_dir"/versions/node/v24*/bin/node 2>/dev/null | tail -n 1)"
  [ -z "$candidate" ] && candidate="$(ls -d "$nvm_dir"/versions/node/v*/bin/node 2>/dev/null | tail -n 1)"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then printf '%s' "$candidate"; return 0; fi
  return 1
}

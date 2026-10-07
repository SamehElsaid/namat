#!/bin/bash
# The NAMAT Release executable must actually reference the rebuilt Airlift
# exports. A header or an unlinked Swift declaration is not enough.
set -euo pipefail

BIN="${1:-}"
[[ -n "$BIN" && -f "$BIN" ]] || {
  echo "usage: $0 /path/to/Namat" >&2
  exit 1
}

SYMBOLS="al_exploit_read_file al_bytes_free al_exploit_write_dir al_syslog_stream_start al_pairing_run_host al_pairing_material_valid al_pairing_probe_connection al_pairing_probe_cancel"
listing="$(mktemp)"
nm "$BIN" >"$listing"
file "$BIN" | grep -q 'Mach-O' || {
  echo "Namat executable is not Mach-O: $(file "$BIN")" >&2
  exit 1
}

for sym in $SYMBOLS; do
  if ! grep -E "[ 	][TtDS] _?${sym}\$" "$listing" >/dev/null; then
    echo "Namat Release did not resolve defined symbol ${sym}" >&2
    grep -E "${sym}" "$listing" >&2 || true
    exit 1
  fi
done

echo "Namat Release resolves: $SYMBOLS"
rm -f "$listing"

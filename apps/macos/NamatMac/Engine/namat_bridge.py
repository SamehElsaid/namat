#!/usr/bin/env python3
"""
NamatMac bridge — thin JSON command layer over the vendored AirCard engine
(MIT, Johnny Franks). The SwiftUI app shells out to this script with
/usr/bin/python3 and consumes single-line JSON on stdout.

Commands:
  devices                                   -> {"connected": bool, "devices": [...]}
  scan <udid> [seconds]                     -> {"ok": true, "cards": [...]}  (streaming {"type":"log"} lines)
  cards                                     -> {"cards": [...]}
  save-cards '<json array>'                 -> {"ok": true}
  prepare-image <src> <dst>                 -> {"ok": true, "path": dst}
  backup <udid> <card_hash>                 -> {"ok": bool, "backedUp": [...]}
  flash <udid> <card_hash> <image>          -> streamed steps + {"ok": bool}
  restore <udid> <card_hash>                -> {"ok": bool}
  inspect-passthm <path>                    -> passthm info JSON
  backup-passthm <udid> <path>              -> {"ok": bool, "backedUp": [...]}
  flash-passthm <udid> <path> [ver] [lang] [bold]
                                            -> streamed steps + {"ok": bool}
  restore-passthm <udid> <path>             -> {"ok": bool}
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))  # vendored engine modules live next to us

# Vendored AirCard engine (MIT). Bundled copies live in the app Resources dir.
import aircard
import aircard_backend
from apply_card_skin import read_file, write_file, invalidate_cache
from card_assets import CACHE_FILES

BACKUP_ROOT = Path.home() / ".namat" / "backups"


def out(obj: dict):
    print(json.dumps(obj), flush=True)


def fail(message: str, **extra):
    out({"ok": False, "error": message, **extra})
    sys.exit(1)


# ---------------------------------------------------------------- card skins

CARD_ASSETS = aircard.TARGET_ASSETS  # @3x / @2x combined backgrounds


def pkpass_dir(card_hash: str) -> str:
    return f"/var/mobile/Library/Passes/Cards/{card_hash}.pkpass"


def backup_dir(udid: str, card_hash: str) -> Path:
    return BACKUP_ROOT / udid / card_hash


def cmd_backup(udid: str, card_hash: str):
    """Reads the live Wallet artwork and stores it locally for later restore.

    Skips silently when a backup already exists — the FIRST backup must be the
    pristine bank artwork, never a previously flashed skin.
    """
    target = backup_dir(udid, card_hash)
    backed = []
    for asset in CARD_ASSETS:
        dest = target / asset
        if dest.is_file():
            backed.append(asset)
            continue
        data = read_file(udid, pkpass_dir(card_hash), asset)
        if data:
            target.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            backed.append(asset)
        else:
            out({"type": "log", "message": f"backup: could not read {asset}"})
    out({"ok": True, "backedUp": backed})


def cmd_restore(udid: str, card_hash: str):
    target = backup_dir(udid, card_hash)
    if not target.is_dir():
        fail("no_backup", card=card_hash)
    ok_all = True
    for asset in CARD_ASSETS:
        src = target / asset
        if not src.is_file():
            continue
        ok = write_file(udid, pkpass_dir(card_hash), asset, src.read_bytes())
        out({"type": "step", "asset": asset, "ok": ok})
        ok_all = ok_all and ok
    ok_cache = invalidate_cache(udid, card_hash)
    out({"type": "step", "asset": "cache", "ok": ok_cache})
    out({"ok": ok_all and ok_cache})


def cmd_flash(udid: str, card_hash: str, image_path: str):
    cmd_backup(udid, card_hash)  # best-effort pristine backup first
    aircard_backend.cmd_flash(udid, card_hash, image_path)  # streams steps, exits 1 on failure


def cmd_scan(udid: str, seconds: int):
    """Non-interactive card scan: tails the device syslog for `seconds`,
    collecting Wallet card hashes exactly like AirCard's interactive mode."""
    cmd = aircard.syslog_command(udid)
    if not cmd:
        fail("device_helper_missing")
    existing = set(aircard.load_saved_cards())
    found = set(existing)
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )
        deadline = time.time() + max(5, seconds)
        for line in proc.stdout:
            if time.time() > deadline:
                break
            if line.startswith("AirCard scanner: "):
                out({"type": "log", "message": line.strip()})
                continue
            for rx in aircard.CARD_REGEXES:
                for m in rx.finditer(line):
                    h = m.group(1) if m.groups() else m.group(0)
                    if h and h not in found:
                        found.add(h)
                        out({"type": "card", "hash": h})
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    except OSError as e:
        fail("scan_failed", detail=str(e))
    new_cards = [h for h in found if h not in existing]
    aircard.save_cards(sorted(found))
    out({"ok": True, "cards": sorted(found), "new": new_cards})


# ------------------------------------------------------------- passcode theme

def passthm_backup_dir(udid: str, passthm_path: str) -> Path:
    name = Path(passthm_path).stem
    return BACKUP_ROOT / udid / "passthm" / name


def passthm_target_dirs(passthm_path: str, telephony_ver: str) -> list[str]:
    info = aircard_backend.parse_passthm_archive(passthm_path)
    dirs = set()
    for item in info.get("items", []):
        path = item.get("path", "")
        if "/Library/Caches/" in path:
            dirs.add(path.rsplit("/", 1)[0])
    if not dirs and telephony_ver:
        dirs.add(f"/var/mobile/Library/Caches/{telephony_ver}")
    return sorted(dirs)


def cmd_backup_passthm(udid: str, passthm_path: str, telephony_ver: str = "TelephonyUI-10"):
    target = passthm_backup_dir(udid, passthm_path)
    backed = []
    info = aircard_backend.parse_passthm_archive(passthm_path)
    for item in info.get("items", []):
        path = item.get("path", "")
        leaf = path.rsplit("/", 1)[1] if "/" in path else path
        parent = path.rsplit("/", 1)[0] if "/" in path else "/"
        if not leaf:
            continue
        dest = target / parent.strip("/").replace("/", "__") / leaf
        if dest.is_file():
            backed.append(path)
            continue
        data = read_file(udid, parent, leaf)
        if data:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            backed.append(path)
    out({"ok": True, "backedUp": backed})


def cmd_restore_passthm(udid: str, passthm_path: str):
    target = passthm_backup_dir(udid, passthm_path)
    if not target.is_dir():
        fail("no_backup")
    ok_all = True
    for parent_dir in sorted(target.iterdir()):
        if not parent_dir.is_dir():
            continue
        parent = "/" + parent_dir.name.replace("__", "/")
        for src in sorted(parent_dir.iterdir()):
            ok = write_file(udid, parent, src.name, src.read_bytes())
            ok_all = ok_all and ok
    out({"ok": ok_all})


def cmd_flash_passthm(udid: str, passthm_path: str, ver: str, lang: str, bold: str):
    cmd_backup_passthm(udid, passthm_path, ver or "TelephonyUI-10")
    if not aircard_backend.cmd_flash_passthm(udid, passthm_path, ver, lang, bold):
        sys.exit(1)


# ---------------------------------------------------------------------- main

def main():
    if len(sys.argv) < 2:
        fail("no_command")
    cmd = sys.argv[1].lstrip("-")
    a = sys.argv[2:]

    if cmd == "devices":
        aircard_backend.cmd_devices(a[0] if a else None)
    elif cmd == "scan":
        cmd_scan(a[0], int(a[1]) if len(a) > 1 else 60)
    elif cmd == "cards":
        out({"cards": aircard.load_saved_cards()})
    elif cmd == "save-cards" and a:
        aircard.save_cards(json.loads(a[0]))
        out({"ok": True})
    elif cmd == "prepare-image" and len(a) > 1:
        aircard_backend.cmd_prepare_image(a[0], a[1])
    elif cmd == "backup" and len(a) > 1:
        cmd_backup(a[0], a[1])
    elif cmd == "flash" and len(a) > 2:
        cmd_flash(a[0], a[1], a[2])
    elif cmd == "restore" and len(a) > 1:
        cmd_restore(a[0], a[1])
    elif cmd == "inspect-passthm" and a:
        aircard_backend.cmd_inspect_passthm(a[0])
    elif cmd == "backup-passthm" and a:
        cmd_backup_passthm(a[0], a[1], a[2] if len(a) > 2 else "TelephonyUI-10")
    elif cmd == "flash-passthm" and len(a) > 1:
        cmd_flash_passthm(
            a[0], a[1],
            a[2] if len(a) > 2 else "TelephonyUI-10",
            a[3] if len(a) > 3 else "all",
            a[4] if len(a) > 4 else "both",
        )
    elif cmd == "restore-passthm" and a:
        cmd_restore_passthm(a[0], a[1])
    else:
        fail(f"unknown_command: {cmd}")


if __name__ == "__main__":
    main()

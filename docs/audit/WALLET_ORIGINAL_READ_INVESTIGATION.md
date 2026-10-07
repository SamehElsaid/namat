# Wallet original artwork read

**Date:** 2026-10-03  
**iOS base:** [Mak5er/AirCard-iOS](https://github.com/Mak5er/AirCard-iOS) `6342a3455e17ca357da19537d1e44317a3f69f32`  
**Desktop read:** [Mak5er/AirCard](https://github.com/Mak5er/AirCard) v1.2.4 commit `d6320554c07d65f53be91fb578b3e57f996c2605` (`feat: add card backup read path (export-read-restore) via afc-read helper`)

## Status

| Gate | Result |
|---|---|
| CODE IMPLEMENTED | Yes. `al_exploit_read_file` / `al_bytes_free` and the Swift caller are in this branch. |
| HOST RUST CHECK | Yes. `cargo +stable check` of `Vendor/airlift-rust` completed on Linux (rustc 1.99). |
| MAC/XCODE BUILD | GitHub Actions on `macos-14` rebuilds `AirliftFFI.xcframework` from `Vendor/airlift-rust`, checks the Mach-O exports, and compiles NAMAT iOS Release against that artifact. The binary is not committed. |
| PHYSICAL IPHONE | No. No device was available. Do not treat Apply or Restore as device-proven. |

The earlier note that “only a new exploit read must be invented” is out of date. Desktop AirCard already shipped the read. This branch ports that mechanism. It does not invent a Swift function that returns stand-in bytes.

## What d632055 actually does

`apply_card_skin.read_file` does not AFC-read `/var/mobile/Library/Passes`. AFC is rooted at `/var/mobile/Media`. The read is a move:

1. `snapshot-books` saves the Books preimage (`Books/Books.plist`, `Books/Sync/Books.plist`, `Books/Sync/Upload.plist`, and the three `OutstandingAssets_4.sqlite*` files).
2. `stage` pushes a StreamingZip whose payload is the marker `aircard-backup-staging`, plus a Books manifest.
3. AirTraffic `FileComplete` pairs are only:
   - `../../airlift-src-<token>/p0/p1/p2/link` → `airlift-link-<token>`
   - `posixpath.relpath(target/leaf, /var/mobile/Media/Airlock/Book)` → `airlift-recovered-<token>`
4. That second pair **moves** the existing protected leaf into Media. The marker is not a destination, so it is not written over the pass.
5. `afc-read` copies `airlift-recovered-<token>` (32 MiB cap) into host memory.
6. `write_file` writes those same bytes back to `target/leaf`.
7. `finish-write` removes the Media staging objects and restores the Books preimage.

Compared with AirCard-iOS `6342a345`, `exploit_run` already copy-backs a canary this process just wrote. Its identifiers include `payload`, and the leaf name is a new `airlift-canary-*.bin`. That confirms the tunnel. It is not a read of `cardBackgroundCombined@3x.png`. `al_exploit_write_dir` only pushes a host directory. House Arrest, `al_find_app_container`, and syslog still do not return pass artwork.

## What was ported

| Piece | Where |
|---|---|
| Identifier plan, 32 MiB cap, Books file list, marker-not-a-destination rule | `prototypes/wallet-engine/crates/airlift-read` |
| Failure policy and crash record | same crate (`run_export_read_restore`) |
| Device steps: snapshot, stage, AirTraffic move, AFC read, exact write-back, Books restore | `Vendor/airlift-rust/src/backup_read.rs` |
| C exports | `al_exploit_read_file`, `al_bytes_free` in `Vendor/airlift-rust/include/airlift.h` |
| Swift caller | `RealAirliftFFIClient.readPassAssets` → `namatAirliftReadFile` (`@_silgen_name("al_exploit_read_file")`) when `AirliftFFI` is linked |

Caller owns the returned buffer and releases it with `al_bytes_free(ptr, len)`. Strings still use `al_string_free`. The library does not open an HTTP client.

Return codes: `0` full success, `1` no restorable bytes, `2` bytes captured but the protected path was not restored, `3` protected path restored but Books/cleanup failed, `4` bad arguments. Apply treats any non-zero code as a failed read.

### Safer than the Python helper

Desktop `read_file` calls `finish-write` when AirTraffic fails. `finish-write` deletes `Media/airlift-recovered-*`. If the move already happened, that delete is the only copy.

This port does **not** delete `recovered` unless write-back and Books restore both succeeded. A crash after the bytes are captured stores a local JSON record (artwork plus Books preimage) under the app's recovery directory and resumes that record on the next read instead of starting a second move. Records are excluded from backup. They are not uploaded.

An empty buffer, a buffer over 32 MiB, or a buffer equal to `aircard-backup-staging` is rejected and is not written back.

## Artwork suite

AirCard-iOS `ImageEngine.prepareAllCardSkins` emits:

- `cardBackgroundCombined@3x.png`, `diffuse@3x.png`, `background@3x.png`, `strip@3x.png`
- `cardBackgroundCombined@2x.png`, `diffuse@2x.png`, `background@2x.png`, `strip@2x.png`
- `cardBackgroundCombined.pdf`, `background.pdf`, `strip.pdf`

Desktop `apply_card_skin.py` `main` writes only the two combined PNGs. NAMAT `AirCardWalletEngine.applySkin` stages only those two combined PNGs. Restore writes the captured bytes of each leaf; it does not resample `@2x` from `@3x`.

`readPassAssets` therefore export-reads `cardBackgroundCombined@3x.png` and `cardBackgroundCombined@2x.png`. Both must be PNG (`89 50 4E 47`) before the vault stores them. Apply refuses to stage any name that was not in that set.

The other ImageEngine leaves are not export-moved. There is no pre-move existence check outside Media, and a missing leaf must not be probed with a destructive move. NAMAT does not write those leaves, so a later Restore does not need to regenerate them. If a future Apply starts writing `diffuse`, `background`, `strip`, or the PDFs, those names have to be added to the read set first. `PassAssetSet.imageEngineSuite` lists them for that check.

The vault stores the whole captured map (first write wins, SHA-256 verified). A test pass that also contains `strip@3x.png` and `strip.pdf` keeps those exact bytes across Apply B, Apply C, and Restore.

## Apply gate

`applySkin` order:

1. Read the original asset set.
2. Reject a missing or non-PNG required leaf (and a bad PNG/PDF signature on any extra leaf).
3. Store the set in the local vault and require `present(_, verified: true)`.
4. Only then stage and write the skin.

A failed read throws before that write. Unlinked builds throw `NAMAT_WALLET_FFI_UNAVAILABLE` from `requireLinked()` and do not invent bytes.

## Proof already run

- `cargo test --locked` in `crates/airlift-read`: success path, exact bytes, two-asset backup, cleanup, failure before the move, export-then-read failure, write-back failure, Books restore failure, resume after interruption, marker rejection, no HTTP strings in the crate.
- `cargo +stable check` of `Vendor/airlift-rust` on Linux, which typechecks `al_exploit_read_file`.
- WalletSkinEngine tests, including signature rejection before write and exact multi-asset restore through the in-memory pass double.

## Still required

1. On a paired iPhone with LocalDevVPN, read a real pass, confirm both combined PNGs, Apply skin B, Apply skin C, Restore, and compare the pass bytes to the vault.

The xcframework is rebuilt in CI from `Vendor/airlift-rust` (`prototypes/wallet-engine/Vendor/build-airlift-xcframework.sh` on `macos-14`). That artifact is not a substitute for a paired device. Physical read is **not** verified and physical Apply B → C → Restore Original is **not** verified.

use std::collections::BTreeMap;
use std::fs;

use airlift_read::sim::{Fault, SimDevice, SimIo};
use airlift_read::{
    plan_read, run_export_read_restore, validate_leaf, CODE_CAPTURED_NOT_RESTORED, CODE_FAILED,
    CODE_OK, CODE_RESTORED_CLEANUP_FAILED, STAGING_MARKER,
};
use futures::executor::block_on;

const TARGET: &str = "/var/mobile/Library/Passes/Cards/HASH.pkpass";
const TOKEN: &str = "aaaaaaaaaaaaaaaaaaaa";

fn png(tag: u8) -> Vec<u8> {
    vec![0x89, 0x50, 0x4e, 0x47, tag, 1, 2, 3]
}

fn device_with(leaf: &str, bytes: Vec<u8>) -> SimIo {
    let mut files = BTreeMap::new();
    files.insert(leaf.to_owned(), bytes);
    SimIo::new(SimDevice::new(files))
}

fn temp_dir(name: &str) -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("airlift-read-{name}-{n}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn plan_matches_desktop_read_identifiers() {
    let plan = plan_read(TARGET, "cardBackgroundCombined@3x.png", TOKEN).unwrap();
    assert_eq!(
        plan.target_identifier,
        "../../../Library/Passes/Cards/HASH.pkpass/cardBackgroundCombined@3x.png"
    );
    assert_eq!(plan.link_identifier, format!("../../airlift-src-{TOKEN}/p0/p1/p2/link"));
    assert_eq!(plan.recovered, format!("airlift-recovered-{TOKEN}"));
    assert_eq!(
        plan.export_destinations(),
        [plan.link_destination.as_str(), plan.recovered.as_str()]
    );
    assert!(plan.marker_stays_in_staging_zip());
    assert!(!plan.export_identifiers().iter().any(|id| id.contains("payload")));
}

#[test]
fn rejects_non_plain_leaf() {
    for bad in ["", ".", "..", "a/b", "/abs"] {
        assert!(validate_leaf(bad).is_err());
        assert!(plan_read(TARGET, bad, TOKEN).is_err());
    }
}

#[test]
fn successful_export_read_restore_keeps_exact_bytes_and_cleans_up() {
    let original = png(9);
    let mut io = device_with("cardBackgroundCombined@3x.png", original.clone());
    let plan = plan_read(TARGET, "cardBackgroundCombined@3x.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let outcome = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(outcome.code, CODE_OK);
    assert_eq!(outcome.bytes.as_deref(), Some(original.as_slice()));
    assert_ne!(outcome.bytes.as_deref(), Some(STAGING_MARKER));
    assert_eq!(io.device.files.get("cardBackgroundCombined@3x.png"), Some(&original));
    assert!(io.device.media.is_empty());
    assert!(!io.device.staging);
    assert!(io.books_match_original());
    assert_eq!(io.remove_recovered_calls, 1);
    assert!(dir.read_dir().unwrap().next().is_none());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn multi_asset_backup_does_not_mix_scales() {
    let mut files = BTreeMap::new();
    files.insert("cardBackgroundCombined@3x.png".to_owned(), png(3));
    files.insert("cardBackgroundCombined@2x.png".to_owned(), png(2));
    let mut io = SimIo::new(SimDevice::new(files.clone()));
    let dir = temp_dir("success");
    for (index, leaf) in ["cardBackgroundCombined@3x.png", "cardBackgroundCombined@2x.png"]
        .iter()
        .enumerate()
    {
        let token = format!("{:020x}", index + 1);
        let plan = plan_read(TARGET, leaf, &token).unwrap();
        let outcome = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
        assert_eq!(outcome.code, CODE_OK);
        assert_eq!(outcome.bytes.as_ref(), files.get(*leaf));
    }
    assert_eq!(io.device.files, files);
    assert!(io.device.media.is_empty());
    assert_ne!(files["cardBackgroundCombined@3x.png"], files["cardBackgroundCombined@2x.png"]);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn failure_before_move_leaves_the_original_in_place() {
    let original = png(4);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::Snapshot;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let outcome = block_on(run_export_read_restore(&mut io, &plan, None));
    assert_eq!(outcome.code, CODE_FAILED);
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    assert_eq!(io.export_calls, 0);
    assert_eq!(io.write_back_calls, 0);

    io.fault = Fault::Stage;
    let outcome = block_on(run_export_read_restore(&mut io, &plan, None));
    assert_eq!(outcome.code, CODE_FAILED);
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    assert!(io.books_match_original());

    io.fault = Fault::ExportBeforeMove;
    let dir = temp_dir("success");
    let outcome = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(outcome.code, CODE_FAILED);
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    assert!(io.device.media.is_empty());
    let retry = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(retry.code, CODE_FAILED);
    assert_eq!(io.export_calls, 1);
    io.fault = Fault::None;
    let fresh = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(fresh.code, CODE_OK);
    assert_eq!(fresh.bytes.as_deref(), Some(original.as_slice()));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_then_afc_read_failure_preserves_recovered_copy() {
    let original = png(5);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::AfcRead;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let outcome = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(outcome.code, CODE_FAILED);
    assert!(outcome.bytes.is_none());
    assert_eq!(io.device.files.get("leaf.png"), None);
    assert_eq!(io.device.media.get(&plan.recovered), Some(&original));
    assert_eq!(io.remove_recovered_calls, 0);
    assert_eq!(io.write_back_calls, 0);

    let resumed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(resumed.code, CODE_OK);
    assert_eq!(resumed.bytes.as_deref(), Some(original.as_slice()));
    assert_eq!(io.export_calls, 1);
    assert!(io.device.media.is_empty());
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_after_move_can_resume_without_a_second_export() {
    let original = png(6);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::ExportAfterMove;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let failed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(failed.code, CODE_FAILED);
    assert_eq!(io.device.media.get(&plan.recovered), Some(&original));
    let resumed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(resumed.code, CODE_OK);
    assert_eq!(resumed.bytes.as_deref(), Some(original.as_slice()));
    assert_eq!(io.export_calls, 1);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn captured_bytes_survive_write_back_failure_and_resume() {
    let original = png(7);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::WriteBack;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let failed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(failed.code, CODE_CAPTURED_NOT_RESTORED);
    assert_eq!(failed.bytes.as_deref(), Some(original.as_slice()));
    assert_eq!(io.device.files.get("leaf.png"), None);
    assert_eq!(io.device.media.get(&plan.recovered), Some(&original));
    assert_eq!(io.remove_recovered_calls, 0);

    let resumed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(resumed.code, CODE_OK);
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    assert!(io.device.media.is_empty());
    assert!(io.books_match_original());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn books_restore_failure_keeps_recovered_until_retry() {
    let original = png(8);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::BooksRestore;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let failed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(failed.code, CODE_RESTORED_CLEANUP_FAILED);
    assert_eq!(io.device.files.get("leaf.png"), Some(&original));
    assert_eq!(io.device.media.get(&plan.recovered), Some(&original));
    assert_eq!(io.remove_recovered_calls, 0);
    let resumed = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(resumed.code, CODE_OK);
    assert!(io.device.media.is_empty());
    assert!(io.books_match_original());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn staging_marker_is_never_written_back() {
    let original = png(1);
    let mut io = device_with("leaf.png", original.clone());
    io.fault = Fault::ReturnMarker;
    let plan = plan_read("/var/tmp", "leaf.png", TOKEN).unwrap();
    let dir = temp_dir("success");
    let outcome = block_on(run_export_read_restore(&mut io, &plan, Some(&dir)));
    assert_eq!(outcome.code, CODE_FAILED);
    assert_eq!(io.write_back_calls, 0);
    assert_eq!(io.remove_recovered_calls, 0);
    assert_eq!(io.device.media.get(&plan.recovered), Some(&original));
    assert!(!io.device.files.values().any(|bytes| bytes.as_slice() == STAGING_MARKER));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn crate_sources_do_not_call_http() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    for entry in fs::read_dir(root).unwrap() {
        let text = fs::read_to_string(entry.unwrap().path()).unwrap();
        let lower = text.to_ascii_lowercase();
        assert!(!lower.contains("reqwest"));
        assert!(!lower.contains("hyper::"));
        assert!(!lower.contains("http://"));
        assert!(!lower.contains("https://"));
        assert!(!lower.contains("urlsession"));
    }
}

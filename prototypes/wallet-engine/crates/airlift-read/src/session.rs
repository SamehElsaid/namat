//! Ordered export → AFC read → exact write-back → Books restore → cleanup.
//!
//! `remove_recovered` is called only after write-back and Books restore both
//! succeed. An AirTraffic error does not delete Media/recovered: the desktop
//! helper's `finish-write` would, and that can drop the only copy of the leaf.

use std::path::Path;

use crate::plan::{ReadPlan, AFC_READ_LIMIT, STAGING_MARKER};
use crate::recovery::{
    delete_recovery, load_recovery, save_recovery, BooksSnapshot, RecoveryPhase, RecoveryRecord,
};

pub const CODE_OK: i32 = 0;
pub const CODE_FAILED: i32 = 1;
pub const CODE_CAPTURED_NOT_RESTORED: i32 = 2;
pub const CODE_RESTORED_CLEANUP_FAILED: i32 = 3;
pub const CODE_BAD_ARG: i32 = 4;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionOutcome {
    pub code: i32,
    pub bytes: Option<Vec<u8>>,
    pub error: String,
}

impl SessionOutcome {
    pub fn ok(bytes: Vec<u8>) -> Self {
        Self {
            code: CODE_OK,
            bytes: Some(bytes),
            error: String::new(),
        }
    }

    pub fn fail(code: i32, error: impl Into<String>, bytes: Option<Vec<u8>>) -> Self {
        Self {
            code,
            bytes,
            error: error.into(),
        }
    }
}

/// Side effects performed by the iOS FFI or by the in-memory simulator.
/// Implementations must not upload the file bytes.
#[allow(async_fn_in_trait)]
pub trait BackupIo {
    async fn snapshot_books(&mut self) -> Result<BooksSnapshot, String>;
    async fn stage(&mut self, plan: &ReadPlan) -> Result<(), String>;
    async fn airtraffic_export(&mut self, plan: &ReadPlan) -> Result<(), String>;
    async fn afc_read(&mut self, media_path: &str) -> Result<Vec<u8>, String>;
    async fn write_back(&mut self, plan: &ReadPlan, bytes: &[u8]) -> Result<(), String>;
    async fn restore_books(&mut self, books: &BooksSnapshot) -> Result<(), String>;
    /// Remove the StreamingZip source and the relocated link. Must not delete recovered.
    async fn remove_staging(&mut self, plan: &ReadPlan) -> Result<(), String>;
    async fn remove_recovered(&mut self, plan: &ReadPlan) -> Result<(), String>;
}

pub async fn run_export_read_restore<I: BackupIo>(
    io: &mut I,
    plan: &ReadPlan,
    recovery_dir: Option<&Path>,
) -> SessionOutcome {
    if !plan.marker_stays_in_staging_zip() {
        return SessionOutcome::fail(CODE_BAD_ARG, "read plan would publish the staging payload", None);
    }
    if let Some(dir) = recovery_dir {
        match load_recovery(dir, &plan.target_dir, &plan.leaf) {
            Ok(Some(existing)) if !existing.delete_recovered => {
                return resume(io, existing, Some(dir)).await;
            }
            Ok(Some(_)) => {
                let _ = delete_recovery(dir, &plan.target_dir, &plan.leaf);
            }
            Ok(None) => {}
            Err(error) => {
                return SessionOutcome::fail(
                    CODE_FAILED,
                    format!("recovery record unreadable; refusing a new export: {error}"),
                    None,
                );
            }
        }
    }

    let books = match io.snapshot_books().await {
        Ok(books) => books,
        Err(error) => {
            return SessionOutcome::fail(CODE_FAILED, format!("snapshot-books: {error}"), None);
        }
    };

    if let Err(error) = io.stage(plan).await {
        let _ = io.restore_books(&books).await;
        let _ = io.remove_staging(plan).await;
        return SessionOutcome::fail(CODE_FAILED, format!("stage: {error}"), None);
    }

    if let Err(error) = io.airtraffic_export(plan).await {
        // The move may already have landed in Media/recovered. Do not delete it.
        let _ = io.restore_books(&books).await;
        let _ = io.remove_staging(plan).await;
        let record = RecoveryRecord::export_failed(plan, &books);
        persist(recovery_dir, &record);
        return SessionOutcome::fail(
            CODE_FAILED,
            format!("airtraffic export failed; recovered copy preserved: {error}"),
            None,
        );
    }

    let captured = match io.afc_read(&plan.recovered).await {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = io.restore_books(&books).await;
            let _ = io.remove_staging(plan).await;
            persist(recovery_dir, &RecoveryRecord::afc_failed(plan, &books));
            return SessionOutcome::fail(
                CODE_FAILED,
                format!("afc-read failed; Media/recovered was not deleted: {error}"),
                None,
            );
        }
    };

    if captured.is_empty() || captured.len() > AFC_READ_LIMIT || captured.as_slice() == STAGING_MARKER {
        let _ = io.restore_books(&books).await;
        let _ = io.remove_staging(plan).await;
        persist(recovery_dir, &RecoveryRecord::afc_failed(plan, &books));
        return SessionOutcome::fail(
            CODE_FAILED,
            "refusing captured bytes that are empty, over the afc-read cap, or the staging marker",
            None,
        );
    }

    // Durability point: a crash after this write can resume without a second move.
    let captured_record = RecoveryRecord::with_bytes(RecoveryPhase::Captured, plan, &books, &captured);
    if let Some(dir) = recovery_dir {
        if let Err(error) = save_recovery(dir, &captured_record) {
            let _ = io.restore_books(&books).await;
            return SessionOutcome::fail(
                CODE_CAPTURED_NOT_RESTORED,
                format!("bytes captured but recovery record was not stored: {error}"),
                Some(captured),
            );
        }
    }

    finish_from_bytes(io, plan, &books, captured, recovery_dir).await
}

async fn resume<I: BackupIo>(
    io: &mut I,
    record: RecoveryRecord,
    recovery_dir: Option<&Path>,
) -> SessionOutcome {
    let plan = ReadPlan {
        target_dir: record.target_dir.clone(),
        leaf: record.leaf.clone(),
        source: record.source.clone(),
        link_destination: record.link_destination.clone(),
        recovered: record.recovered.clone(),
        link_identifier: String::new(),
        target_identifier: String::new(),
    };
    let books = match record.books_snapshot() {
        Ok(books) => books,
        Err(error) => return SessionOutcome::fail(CODE_FAILED, error, None),
    };

    match record.phase {
        RecoveryPhase::BooksRestoreFailed => {
            let bytes = match record.artwork_bytes() {
                Ok(Some(bytes)) => bytes,
                Ok(None) => {
                    return SessionOutcome::fail(CODE_FAILED, "books restore record has no artwork", None);
                }
                Err(error) => return SessionOutcome::fail(CODE_FAILED, error, None),
            };
            return finish_books_and_cleanup(io, &plan, &books, bytes, recovery_dir).await;
        }
        RecoveryPhase::Captured | RecoveryPhase::WriteBackFailed => {
            let bytes = match record.artwork_bytes() {
                Ok(Some(bytes)) => bytes,
                Ok(None) => {
                    return SessionOutcome::fail(CODE_FAILED, "captured record has no artwork", None);
                }
                Err(error) => return SessionOutcome::fail(CODE_FAILED, error, None),
            };
            return finish_from_bytes(io, &plan, &books, bytes, recovery_dir).await;
        }
        RecoveryPhase::ExportFailed | RecoveryPhase::AfcReadFailed => {
            match io.afc_read(&plan.recovered).await {
                Ok(bytes)
                    if !bytes.is_empty()
                        && bytes.len() <= AFC_READ_LIMIT
                        && bytes.as_slice() != STAGING_MARKER =>
                {
                    if let Some(dir) = recovery_dir {
                        let stored = RecoveryRecord::with_bytes(
                            RecoveryPhase::Captured,
                            &plan,
                            &books,
                            &bytes,
                        );
                        if let Err(error) = save_recovery(dir, &stored) {
                            return SessionOutcome::fail(
                                CODE_CAPTURED_NOT_RESTORED,
                                format!("resume captured bytes but could not store them: {error}"),
                                Some(bytes),
                            );
                        }
                    }
                    finish_from_bytes(io, &plan, &books, bytes, recovery_dir).await
                }
                Ok(_) => SessionOutcome::fail(
                    CODE_FAILED,
                    "recovered media path did not contain the original leaf",
                    None,
                ),
                Err(_) if record.phase == RecoveryPhase::ExportFailed => {
                    // The relocated path is empty, so this export did not land a copy.
                    // A later call may try a fresh export. Do not delete a pass file.
                    if let Some(dir) = recovery_dir {
                        let _ = delete_recovery(dir, &plan.target_dir, &plan.leaf);
                    }
                    SessionOutcome::fail(
                        CODE_FAILED,
                        "export failed before a recovered copy existed",
                        None,
                    )
                }
                Err(error) => SessionOutcome::fail(
                    CODE_FAILED,
                    format!("afc-read still failing; recovered copy preserved: {error}"),
                    None,
                ),
            }
        }
    }
}

async fn finish_from_bytes<I: BackupIo>(
    io: &mut I,
    plan: &ReadPlan,
    books: &BooksSnapshot,
    bytes: Vec<u8>,
    recovery_dir: Option<&Path>,
) -> SessionOutcome {
    if bytes.as_slice() == STAGING_MARKER {
        return SessionOutcome::fail(
            CODE_CAPTURED_NOT_RESTORED,
            "refusing to write the staging marker onto the pass",
            Some(bytes),
        );
    }
    if let Err(error) = io.write_back(plan, &bytes).await {
        let _ = io.restore_books(books).await;
        let _ = io.remove_staging(plan).await;
        persist(
            recovery_dir,
            &RecoveryRecord::with_bytes(RecoveryPhase::WriteBackFailed, plan, books, &bytes),
        );
        return SessionOutcome::fail(
            CODE_CAPTURED_NOT_RESTORED,
            format!("write-back failed; original bytes kept in recovery and Media/recovered: {error}"),
            Some(bytes),
        );
    }
    finish_books_and_cleanup(io, plan, books, bytes, recovery_dir).await
}

async fn finish_books_and_cleanup<I: BackupIo>(
    io: &mut I,
    plan: &ReadPlan,
    books: &BooksSnapshot,
    bytes: Vec<u8>,
    recovery_dir: Option<&Path>,
) -> SessionOutcome {
    if let Err(error) = io.restore_books(books).await {
        persist(
            recovery_dir,
            &RecoveryRecord::with_bytes(RecoveryPhase::BooksRestoreFailed, plan, books, &bytes),
        );
        return SessionOutcome::fail(
            CODE_RESTORED_CLEANUP_FAILED,
            format!("protected leaf was written back; Books preimage was not restored: {error}"),
            Some(bytes),
        );
    }
    if let Err(error) = io.remove_staging(plan).await {
        persist(
            recovery_dir,
            &RecoveryRecord::with_bytes(RecoveryPhase::BooksRestoreFailed, plan, books, &bytes),
        );
        return SessionOutcome::fail(
            CODE_RESTORED_CLEANUP_FAILED,
            format!("protected leaf restored; staging cleanup failed: {error}"),
            Some(bytes),
        );
    }
    if let Err(error) = io.remove_recovered(plan).await {
        persist(
            recovery_dir,
            &RecoveryRecord::with_bytes(RecoveryPhase::BooksRestoreFailed, plan, books, &bytes),
        );
        return SessionOutcome::fail(
            CODE_RESTORED_CLEANUP_FAILED,
            format!("protected leaf restored; Media/recovered cleanup failed: {error}"),
            Some(bytes),
        );
    }
    if let Some(dir) = recovery_dir {
        if let Err(error) = delete_recovery(dir, &plan.target_dir, &plan.leaf) {
            return SessionOutcome::fail(
                CODE_RESTORED_CLEANUP_FAILED,
                format!("device cleanup succeeded; host recovery record remains: {error}"),
                Some(bytes),
            );
        }
    }
    SessionOutcome::ok(bytes)
}

fn persist(dir: Option<&Path>, record: &RecoveryRecord) {
    if let Some(dir) = dir {
        let _ = save_recovery(dir, record);
    }
}

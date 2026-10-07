//! Export-read-restore backup of a protected Wallet leaf.
//!
//! This crate is the device-free half of the desktop AirCard read path
//! (`Mak5er/AirCard` `d632055`, `apply_card_skin.read_file`). It plans the
//! AirTraffic identifiers and decides when a moved original may be deleted.
//! The iOS FFI in `Vendor/airlift-rust` performs the same steps over AFC.
//!
//! Nothing in this crate opens a socket or uploads bytes.

mod plan;
mod recovery;
mod session;

pub mod sim;

pub use plan::{
    plan_read, posix_rel, validate_leaf, ReadPlan, AIRLOCK_ROOT, AFC_READ_LIMIT, LINK_PREFIX,
    RECOVERED_PREFIX, SOURCE_PREFIX, STAGING_MARKER, TRACKED_BOOKS_FILES,
};
pub use recovery::{
    delete_recovery, load_recovery, save_recovery, BooksSnapshot, RecoveryPhase, RecoveryRecord,
};
pub use session::{
    run_export_read_restore, BackupIo, SessionOutcome, CODE_BAD_ARG, CODE_CAPTURED_NOT_RESTORED,
    CODE_FAILED, CODE_OK, CODE_RESTORED_CLEANUP_FAILED,
};

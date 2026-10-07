//! Identifier plan for a backup read.
//!
//! Desktop `read_file` moves `target/leaf` to `Media/airlift-recovered-<token>`
//! and does **not** FileComplete the staging zip payload onto the pass.
//! The zip payload is only the marker `aircard-backup-staging`.

pub const AIRLOCK_ROOT: &str = "/var/mobile/Media/Airlock/Book";
pub const SOURCE_PREFIX: &str = "airlift-src-";
pub const LINK_PREFIX: &str = "airlift-link-";
pub const RECOVERED_PREFIX: &str = "airlift-recovered-";
pub const STAGING_MARKER: &[u8] = b"aircard-backup-staging";
/// Same cap as desktop `afc-read` (`32 * 1024 * 1024`).
pub const AFC_READ_LIMIT: usize = 32 * 1024 * 1024;

/// Books paths snapshotted by desktop `device_helper.m` `TrackedBooksFiles`.
pub const TRACKED_BOOKS_FILES: &[&str] = &[
    "Books/Books.plist",
    "Books/Sync/Books.plist",
    "Books/Sync/Upload.plist",
    "Books/Sync/Database/OutstandingAssets_4.sqlite",
    "Books/Sync/Database/OutstandingAssets_4.sqlite-shm",
    "Books/Sync/Database/OutstandingAssets_4.sqlite-wal",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadPlan {
    pub target_dir: String,
    pub leaf: String,
    pub source: String,
    pub link_destination: String,
    pub recovered: String,
    pub link_identifier: String,
    pub target_identifier: String,
}

impl ReadPlan {
    /// AirTraffic pair for a read. The second destination is Media, not the pass.
    pub fn export_identifiers(&self) -> [&str; 2] {
        [&self.link_identifier, &self.target_identifier]
    }

    pub fn export_destinations(&self) -> [&str; 2] {
        [&self.link_destination, &self.recovered]
    }

    /// The staging marker is not a FileComplete destination.
    pub fn marker_stays_in_staging_zip(&self) -> bool {
        self.export_identifiers()
            .iter()
            .all(|id| !id.ends_with("/payload") && !id.contains("/payload_"))
            && self.export_destinations()[1] == self.recovered
            && !self.recovered.contains(".pkpass")
    }
}

pub fn validate_leaf(leaf: &str) -> Result<(), &'static str> {
    if leaf.is_empty() || leaf == "." || leaf == ".." || leaf.contains('/') || leaf.contains('\0') {
        return Err("leaf must be a plain file name");
    }
    Ok(())
}

/// POSIX `relpath`, matching CPython `posixpath.relpath` for absolute inputs.
pub fn posix_rel(path: &str, base: &str) -> String {
    let path_parts: Vec<&str> = path.trim_start_matches('/').split('/').filter(|s| !s.is_empty()).collect();
    let base_parts: Vec<&str> = base.trim_start_matches('/').split('/').filter(|s| !s.is_empty()).collect();
    let common = path_parts
        .iter()
        .zip(base_parts.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let up = base_parts.len().saturating_sub(common);
    let mut rel: Vec<&str> = (0..up).map(|_| "..").collect();
    rel.extend(path_parts.iter().skip(common).copied());
    if rel.is_empty() {
        return ".".to_owned();
    }
    rel.join("/")
}

pub fn plan_read(target_dir: &str, leaf: &str, token: &str) -> Result<ReadPlan, &'static str> {
    validate_leaf(leaf)?;
    if token.len() != 20 || !token.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
        return Err("token must be 20 lowercase hex characters");
    }
    if !target_dir.starts_with('/') || target_dir.contains('\0') || target_dir.ends_with('/') {
        return Err("target_dir must be an absolute directory without a trailing slash");
    }
    let source = format!("{SOURCE_PREFIX}{token}");
    let link_destination = format!("{LINK_PREFIX}{token}");
    let recovered = format!("{RECOVERED_PREFIX}{token}");
    let link_identifier = format!("../../{source}/p0/p1/p2/link");
    let target_path = format!("{target_dir}/{leaf}");
    let target_identifier = posix_rel(&target_path, AIRLOCK_ROOT);
    let plan = ReadPlan {
        target_dir: target_dir.to_owned(),
        leaf: leaf.to_owned(),
        source,
        link_destination,
        recovered,
        link_identifier,
        target_identifier,
    };
    if !plan.marker_stays_in_staging_zip() {
        return Err("read plan would publish the staging payload");
    }
    Ok(plan)
}

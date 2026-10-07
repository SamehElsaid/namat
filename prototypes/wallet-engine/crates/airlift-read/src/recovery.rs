//! Local recovery records. These stay on the device that captured the bytes.
//! Callers must not upload the JSON.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::plan::ReadPlan;

pub type BooksSnapshot = BTreeMap<String, Option<Vec<u8>>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryPhase {
    /// AirTraffic returned an error. The move may already have happened.
    ExportFailed,
    /// Export was reported successful, but the Media read failed.
    AfcReadFailed,
    /// Original bytes are in memory. Protected path is not restored yet.
    Captured,
    /// Bytes are saved here. Writing them back to the pass failed.
    WriteBackFailed,
    /// Protected path was restored. Books preimage was not.
    BooksRestoreFailed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryRecord {
    pub version: u32,
    pub phase: RecoveryPhase,
    pub target_dir: String,
    pub leaf: String,
    pub source: String,
    pub link_destination: String,
    pub recovered: String,
    pub delete_recovered: bool,
    pub artwork_sha256: Option<String>,
    pub artwork_b64: Option<String>,
    pub books_b64: BTreeMap<String, Option<String>>,
}

impl RecoveryRecord {
    pub fn export_failed(plan: &ReadPlan, books: &BooksSnapshot) -> Self {
        Self::base(RecoveryPhase::ExportFailed, plan, books, None)
    }

    pub fn afc_failed(plan: &ReadPlan, books: &BooksSnapshot) -> Self {
        Self::base(RecoveryPhase::AfcReadFailed, plan, books, None)
    }

    pub fn with_bytes(phase: RecoveryPhase, plan: &ReadPlan, books: &BooksSnapshot, bytes: &[u8]) -> Self {
        Self::base(phase, plan, books, Some(bytes))
    }

    fn base(phase: RecoveryPhase, plan: &ReadPlan, books: &BooksSnapshot, bytes: Option<&[u8]>) -> Self {
        let (artwork_sha256, artwork_b64) = match bytes {
            Some(bytes) => (Some(sha256_hex(bytes)), Some(STANDARD.encode(bytes))),
            None => (None, None),
        };
        let books_b64 = books
            .iter()
            .map(|(path, data)| {
                (
                    path.clone(),
                    data.as_ref().map(|bytes| STANDARD.encode(bytes)),
                )
            })
            .collect();
        Self {
            version: 1,
            phase,
            target_dir: plan.target_dir.clone(),
            leaf: plan.leaf.clone(),
            source: plan.source.clone(),
            link_destination: plan.link_destination.clone(),
            recovered: plan.recovered.clone(),
            delete_recovered: false,
            artwork_sha256,
            artwork_b64,
            books_b64,
        }
    }

    pub fn artwork_bytes(&self) -> Result<Option<Vec<u8>>, String> {
        let Some(b64) = &self.artwork_b64 else {
            return Ok(None);
        };
        let bytes = STANDARD
            .decode(b64)
            .map_err(|_| "recovery artwork is not valid base64".to_owned())?;
        let expected = self
            .artwork_sha256
            .as_deref()
            .ok_or_else(|| "recovery artwork is missing a hash".to_owned())?;
        if sha256_hex(&bytes) != expected {
            return Err("recovery artwork hash mismatch".into());
        }
        Ok(Some(bytes))
    }

    pub fn books_snapshot(&self) -> Result<BooksSnapshot, String> {
        let mut out = BooksSnapshot::new();
        for (path, b64) in &self.books_b64 {
            let data = match b64 {
                None => None,
                Some(b64) => Some(
                    STANDARD
                        .decode(b64)
                        .map_err(|_| format!("books snapshot {path} is not valid base64"))?,
                ),
            };
            out.insert(path.clone(), data);
        }
        Ok(out)
    }
}

pub fn recovery_path(dir: &Path, target_dir: &str, leaf: &str) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(target_dir.as_bytes());
    hasher.update([0]);
    hasher.update(leaf.as_bytes());
    dir.join(format!("{}.json", hex_encode(&hasher.finalize())))
}

pub fn save_recovery(dir: &Path, record: &RecoveryRecord) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("create recovery dir: {e}"))?;
    let dest = recovery_path(dir, &record.target_dir, &record.leaf);
    let tmp = dest.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(record).map_err(|e| format!("encode recovery: {e}"))?;
    fs::write(&tmp, &body).map_err(|e| format!("write recovery: {e}"))?;
    let read_back = fs::read(&tmp).map_err(|e| format!("read recovery temp: {e}"))?;
    if read_back != body {
        let _ = fs::remove_file(&tmp);
        return Err("recovery temp did not match".into());
    }
    fs::rename(&tmp, &dest).map_err(|e| format!("commit recovery: {e}"))?;
    Ok(())
}

pub fn load_recovery(dir: &Path, target_dir: &str, leaf: &str) -> Result<Option<RecoveryRecord>, String> {
    let dest = recovery_path(dir, target_dir, leaf);
    if !dest.exists() {
        return Ok(None);
    }
    let body = fs::read(&dest).map_err(|e| format!("read recovery: {e}"))?;
    let record: RecoveryRecord =
        serde_json::from_slice(&body).map_err(|e| format!("decode recovery: {e}"))?;
    if record.target_dir != target_dir || record.leaf != leaf {
        return Err("recovery record does not match the requested leaf".into());
    }
    Ok(Some(record))
}

pub fn delete_recovery(dir: &Path, target_dir: &str, leaf: &str) -> Result<(), String> {
    let dest = recovery_path(dir, target_dir, leaf);
    if dest.exists() {
        fs::remove_file(&dest).map_err(|e| format!("remove recovery: {e}"))?;
    }
    Ok(())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(&Sha256::digest(bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

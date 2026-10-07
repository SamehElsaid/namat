//! In-memory pass used to exercise the read state machine without a device.

use std::collections::BTreeMap;

use crate::plan::ReadPlan;
use crate::recovery::BooksSnapshot;
use crate::session::BackupIo;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    None,
    Snapshot,
    Stage,
    ExportBeforeMove,
    ExportAfterMove,
    AfcRead,
    ReturnMarker,
    WriteBack,
    BooksRestore,
}

#[derive(Clone, Debug)]
pub struct SimDevice {
    pub files: BTreeMap<String, Vec<u8>>,
    pub books: BTreeMap<String, Vec<u8>>,
    pub media: BTreeMap<String, Vec<u8>>,
    pub staging: bool,
}

impl SimDevice {
    pub fn new(files: BTreeMap<String, Vec<u8>>) -> Self {
        let mut books = BTreeMap::new();
        books.insert("Books/Sync/Books.plist".to_owned(), b"original-books".to_vec());
        Self {
            files,
            books,
            media: BTreeMap::new(),
            staging: false,
        }
    }
}

pub struct SimIo {
    pub device: SimDevice,
    pub fault: Fault,
    pub export_calls: u32,
    pub write_back_calls: u32,
    pub remove_recovered_calls: u32,
    original_books: BTreeMap<String, Vec<u8>>,
}

impl SimIo {
    pub fn new(device: SimDevice) -> Self {
        let original_books = device.books.clone();
        Self {
            device,
            fault: Fault::None,
            export_calls: 0,
            write_back_calls: 0,
            remove_recovered_calls: 0,
            original_books,
        }
    }

    pub fn books_match_original(&self) -> bool {
        self.device.books == self.original_books
    }
}

impl BackupIo for SimIo {
    async fn snapshot_books(&mut self) -> Result<BooksSnapshot, String> {
        if self.fault == Fault::Snapshot {
            self.fault = Fault::None;
            return Err("snapshot failed".into());
        }
        let mut snap = BooksSnapshot::new();
        for path in crate::TRACKED_BOOKS_FILES {
            snap.insert((*path).to_owned(), self.device.books.get(*path).cloned());
        }
        Ok(snap)
    }

    async fn stage(&mut self, _plan: &ReadPlan) -> Result<(), String> {
        if self.fault == Fault::Stage {
            self.fault = Fault::None;
            return Err("stage failed".into());
        }
        self.device.staging = true;
        self.device
            .books
            .insert("Books/Sync/Books.plist".to_owned(), b"export-manifest".to_vec());
        Ok(())
    }

    async fn airtraffic_export(&mut self, plan: &ReadPlan) -> Result<(), String> {
        self.export_calls += 1;
        if self.fault == Fault::ExportBeforeMove {
            self.fault = Fault::None;
            return Err("atc failed before move".into());
        }
        let bytes = self
            .device
            .files
            .remove(&plan.leaf)
            .ok_or_else(|| format!("leaf {} is not on the pass", plan.leaf))?;
        self.device.media.insert(plan.recovered.clone(), bytes);
        if self.fault == Fault::ExportAfterMove {
            self.fault = Fault::None;
            return Err("atc failed after move".into());
        }
        Ok(())
    }

    async fn afc_read(&mut self, media_path: &str) -> Result<Vec<u8>, String> {
        if self.fault == Fault::AfcRead {
            self.fault = Fault::None;
            return Err("afc-read failed".into());
        }
        if self.fault == Fault::ReturnMarker {
            self.fault = Fault::None;
            return Ok(crate::STAGING_MARKER.to_vec());
        }
        self.device
            .media
            .get(media_path)
            .cloned()
            .ok_or_else(|| format!("not found: {media_path}"))
    }

    async fn write_back(&mut self, plan: &ReadPlan, bytes: &[u8]) -> Result<(), String> {
        self.write_back_calls += 1;
        if self.fault == Fault::WriteBack {
            self.fault = Fault::None;
            return Err("write-back failed".into());
        }
        self.device.files.insert(plan.leaf.clone(), bytes.to_vec());
        Ok(())
    }

    async fn restore_books(&mut self, books: &BooksSnapshot) -> Result<(), String> {
        if self.fault == Fault::BooksRestore {
            self.fault = Fault::None;
            return Err("books restore failed".into());
        }
        self.device.books.clear();
        for (path, data) in books {
            if let Some(data) = data {
                self.device.books.insert(path.clone(), data.clone());
            }
        }
        Ok(())
    }

    async fn remove_staging(&mut self, _plan: &ReadPlan) -> Result<(), String> {
        self.device.staging = false;
        Ok(())
    }

    async fn remove_recovered(&mut self, plan: &ReadPlan) -> Result<(), String> {
        self.remove_recovered_calls += 1;
        self.device.media.remove(&plan.recovered);
        Ok(())
    }
}

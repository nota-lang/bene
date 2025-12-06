//! Abstraction over ZIP files which are either resident in memory (for web usage) or on disk (for native usage).

#[cfg(not(target_arch = "wasm32"))]
use std::{fs::File, io::BufReader};
use std::{
  io::{BufRead, Cursor, Read, Seek},
  path::PathBuf,
  sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use format_serde_error::SerdeError;
use log::{debug, warn};
use serde::de::DeserializeOwned;
use zip::ZipArchive;

/// A pointer to a ZIP file in memory.
#[derive(Clone)]
pub struct MemoryZip(pub Arc<[u8]>);

/// A path to a ZIP file on disk.
#[derive(Clone)]
pub struct FileZip(pub PathBuf);

/// A common interface for interpreting an object as a cursor into a ZIP file.
pub trait ZipFormat: Clone {
  type Format: BufRead + Seek;
  fn as_reader(&self) -> Result<Self::Format>;
}

impl ZipFormat for MemoryZip {
  type Format = Cursor<Arc<[u8]>>;
  fn as_reader(&self) -> Result<Self::Format> {
    Ok(Cursor::new(self.0.clone()))
  }
}

#[cfg(not(target_arch = "wasm32"))]
impl ZipFormat for FileZip {
  type Format = BufReader<File>;
  fn as_reader(&self) -> Result<Self::Format> {
    Ok(BufReader::new(File::open(&self.0)?))
  }
}

/// A ZIP archive generic over the details of the format.
pub struct Archive<F: ZipFormat = ArchiveFormat> {
  /// A description of the ZIP file's format.
  format: F,

  /// A cursor into the ZIP file.
  zip: ZipArchive<F::Format>,
}

impl<F: ZipFormat> Archive<F> {
  /// Loads an [`Archive`] from a [`ZipFormat`].
  ///
  /// # Errors
  /// - The file's bytes cannot be interpreted as a ZIP file.
  pub fn load(format: F) -> Result<Self> {
    let reader = format.as_reader()?;
    let zip = ZipArchive::new(reader).context("Failed to parse EPUB as ZIP")?;
    Ok(Archive { format, zip })
  }

  /// Reads the contents of a file in the archive.
  ///
  /// # Errors
  /// - If the file path is not contained in the archive.
  /// - If the bytes fail to be read.
  pub fn read_file(&mut self, file: &str) -> Result<Vec<u8>> {
    debug!("Reading from archive file {file}");

    let mut reader = self
      .zip
      .by_name(file)
      .with_context(|| format!("No entry in epub for file: {file}"))?;

    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer)?;
    Ok(buffer)
  }

  /// Reads a file as XML from the archive.
  ///
  /// # Errors
  /// - If the file cannot be read as bytes.
  /// - If the bytes are not a UTF-8 string.
  /// - If the string is not an XML file deserializable from type `T`.
  pub fn read_xml<T: DeserializeOwned>(&mut self, file: &str) -> Result<(T, String)> {
    let bytes = self
      .read_file(file)
      .with_context(|| format!("Failed to read bytes of file: {file}"))?;
    let string =
      String::from_utf8(bytes).with_context(|| format!("Failed to read file as UTF-8: {file}"))?;
    let xml = quick_xml::de::from_str(&string)
      .with_context(|| format!("Failed to interpret file as XML: {file}"))?;
    Ok((xml, string))
  }

  /// Reads a file as JSON from the archive.
  ///
  /// # Errors
  /// - If the file cannot be read as bytes.
  /// - If the bytes are not a UTF-8 string.
  /// - If the string is not a JSON file deserializable from type `T`.
  pub fn read_json<T: DeserializeOwned>(&mut self, file: &str) -> Result<T> {
    let bytes = self
      .read_file(file)
      .with_context(|| format!("Failed to read bytes of file: {file}"))?;
    let string =
      String::from_utf8(bytes).with_context(|| format!("Failed to read file as UTF-8: {file}"))?;
    serde_json::from_str(&string).map_err(|err| {
      let err_str = anyhow!("{err}");
      warn!("{}", SerdeError::new(string, err));
      err_str.context(format!("Failed to interpret file as JSON: {file}"))
    })
  }

  /// Loads a clone of the current archive.
  ///
  /// # Errors
  /// This may fail if e.g. the file on disk was deleted after `self` was loaded.
  pub fn try_clone(&self) -> Result<Self> {
    let reader = self.format.clone();
    Self::load(reader)
  }
}

#[cfg(target_arch = "wasm32")]
pub type ArchiveFormat = MemoryZip;
#[cfg(not(target_arch = "wasm32"))]
pub type ArchiveFormat = FileZip;

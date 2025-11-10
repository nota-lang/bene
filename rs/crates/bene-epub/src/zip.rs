//! Abstraction over ZIP files which are either resident in memory (for web usage) or on disk (for native usage).

use std::{collections::HashMap, io::Cursor, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use async_zip::tokio::read::seek::ZipFileReader;
use log::debug;
use serde::de::DeserializeOwned;
use tokio::io::{AsyncBufRead, AsyncReadExt, AsyncSeek};
use tokio_util::compat::FuturesAsyncReadCompatExt;

/// A pointer to a ZIP file in memory.
#[derive(Clone)]
pub struct MemoryZip(pub Arc<[u8]>);

/// A path to a ZIP file on disk.
#[derive(Clone)]
pub struct FileZip(pub PathBuf);

/// A common interface for interpreting an object as a cursor into a ZIP file.
#[async_trait::async_trait]
pub trait ZipFormat: Clone {
  type Format: AsyncBufRead + AsyncSeek + Unpin;
  async fn as_reader(&self) -> Result<Self::Format>;
}

#[async_trait::async_trait]
impl ZipFormat for MemoryZip {
  type Format = Cursor<Arc<[u8]>>;
  async fn as_reader(&self) -> Result<Self::Format> {
    Ok(Cursor::new(self.0.clone()))
  }
}

#[cfg(not(feature = "wasm"))]
#[async_trait::async_trait]
impl ZipFormat for FileZip {
  type Format = tokio::io::BufStream<tokio::fs::File>;
  async fn as_reader(&self) -> Result<Self::Format> {
    Ok(tokio::io::BufStream::new(
      tokio::fs::File::open(&self.0).await?,
    ))
  }
}

/// A ZIP archive generic over the details of the format.
pub struct Archive<F: ZipFormat = ArchiveFormat> {
  /// A description of the ZIP file's format.
  format: F,

  /// A cursor into the ZIP file.
  zip: ZipFileReader<F::Format>,

  /// Precomputed mapping from file paths to their position in the archive.
  files: HashMap<String, usize>,
}

impl<F: ZipFormat> Archive<F> {
  /// Asynchronously loads an [`Archive`] from a [`ZipFormat`].
  ///
  /// # Errors
  /// - The file's bytes cannot be interpreted as a ZIP file.
  /// - The file paths cannot be interpreted as UTF-8 strings.
  pub async fn load(format: F) -> Result<Self> {
    let reader = format.as_reader().await?;
    let zip = ZipFileReader::with_tokio(reader)
      .await
      .context("Failed to parse EPUB as ZIP")?;

    let mut files = HashMap::new();
    for (index, entry) in zip.file().entries().iter().enumerate() {
      let filename = entry.filename().clone().into_string()?;      
      files.insert(filename, index);
    }

    Ok(Archive { format, zip, files })
  }

  /// Asynchronously reads the contents of a file in the archive.
  ///
  /// # Errors
  /// - If the file path is not contained in the archive.
  /// - If the bytes fail to be read.
  pub async fn read_file(&mut self, file: &str) -> Result<Vec<u8>> {
    debug!("Reading from archive file {file}");

    let index = self
      .files
      .get(file)
      .with_context(|| format!("No entry in epub for file: {file}"))?;

    #[expect(clippy::missing_panics_doc, reason = "invariant violation")]
    let reader = self
      .zip
      .reader_with_entry(*index)
      .await
      .expect("Archive unexpectedly missing index");

    let mut buffer = Vec::new();
    reader.compat().read_to_end(&mut buffer).await?;
    Ok(buffer)
  }

  /// Asynchronously reads a file as XML from the archive.
  ///
  /// # Errors
  /// - If the file cannot be read as bytes.
  /// - If the bytes are not a UTF-8 string.
  /// - If the string is not an XML file deserializable from type `T`.
  pub async fn read_xml<T: DeserializeOwned>(&mut self, file: &str) -> Result<T> {
    let bytes = self
      .read_file(file)
      .await
      .with_context(|| format!("Failed to read bytes of file: {file}"))?;
    let string =
      String::from_utf8(bytes).with_context(|| format!("Failed to read file as UTF-8: {file}"))?;
    let xml = quick_xml::de::from_str(&string)
      .with_context(|| format!("Failed to interpret file as XML: {file}"))?;
    Ok(xml)
  }

  /// Asynchronously loads a clone of the current archive.
  ///
  /// # Errors
  /// This may fail if e.g. the file on disk was deleted after `self` was loaded.
  pub async fn try_clone(&self) -> Result<Self> {
    let reader = self.format.clone();
    Self::load(reader).await
  }
}

#[cfg(feature = "wasm")]
pub type ArchiveFormat = MemoryZip;
#[cfg(not(feature = "wasm"))]
pub type ArchiveFormat = FileZip;

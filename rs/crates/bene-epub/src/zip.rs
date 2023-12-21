use std::{collections::HashMap, io::Cursor, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use async_zip::tokio::read::seek::ZipFileReader;
use log::debug;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek};
use tokio_util::compat::FuturesAsyncReadCompatExt;

#[derive(Clone)]
pub struct MemoryZip(pub Arc<[u8]>);

#[derive(Clone)]
pub struct FileZip(pub PathBuf);

#[async_trait::async_trait]
pub trait ZipFormat: Clone {
  type Format: AsyncRead + AsyncSeek + Unpin;
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
  type Format = tokio::fs::File;
  async fn as_reader(&self) -> Result<Self::Format> {
    Ok(tokio::fs::File::open(&self.0).await?)
  }
}

pub struct Archive<F: ZipFormat = ArchiveFormat> {
  format: F,
  zip: ZipFileReader<F::Format>,
  files: HashMap<String, usize>,
}

impl<F: ZipFormat> Archive<F> {
  pub async fn load(format: F) -> Result<Self> {
    let reader = format.as_reader().await?;
    let zip = ZipFileReader::with_tokio(reader)
      .await
      .context("Failed to parse epub as zip")?;

    let file_iter = zip.file().entries().iter().enumerate();
    let files = file_iter
      .map(|(index, entry)| {
        let entry = entry.entry();
        let filename = entry.filename().clone().into_string()?;
        Ok((filename, index))
      })
      .collect::<Result<HashMap<_, _>>>()?;

    Ok(Archive { format, zip, files })
  }

  pub async fn read_file(&mut self, file: &str) -> Result<Vec<u8>> {
    debug!("Reading from archive file {file}");

    let index = self
      .files
      .get(file)
      .with_context(|| format!("No entry in epub for file: {file}"))?;

    let reader = self.zip.reader_with_entry(*index).await?;

    let mut buffer = Vec::new();
    reader.compat().read_to_end(&mut buffer).await?;
    Ok(buffer)
  }

  pub async fn try_clone(&self) -> Result<Self> {
    let reader = self.format.clone();
    Self::load(reader).await
  }
}

#[cfg(feature = "wasm")]
pub type ArchiveFormat = MemoryZip;
#[cfg(not(feature = "wasm"))]
pub type ArchiveFormat = FileZip;

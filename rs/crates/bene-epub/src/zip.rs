use std::{collections::HashMap, io::Cursor, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use async_zip::tokio::read::seek::ZipFileReader;
use log::debug;
use mediatype::MediaType;
use tokio::{
  io::{AsyncRead, AsyncReadExt, AsyncSeek},
  sync::Mutex,
};
use tokio_util::compat::FuturesAsyncReadCompatExt;

#[derive(Debug)]
pub enum FileContents {
  Unicode(String),
  Binary(Vec<u8>),
}

impl FileContents {
  pub fn unwrap_unicode(self) -> String {
    match self {
      FileContents::Unicode(s) => s,
      FileContents::Binary(_) => panic!("File was unexpectedly binary"),
    }
  }

  pub fn unwrap_unicode_ref(&self) -> &String {
    match self {
      FileContents::Unicode(s) => s,
      FileContents::Binary(_) => panic!("File was unexpectedly binary"),
    }
  }

  pub fn unwrap_binary(self) -> Vec<u8> {
    match self {
      FileContents::Binary(v) => v,
      FileContents::Unicode(_) => panic!("File was unexpectedly unicode"),
    }
  }
}

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
  zip: Mutex<ZipFileReader<F::Format>>,
  files: HashMap<String, usize>,
}

fn media_type_definitely_unicode(media_type: MediaType<'_>) -> bool {
  let (ty, subty, suffix) = (
    media_type.ty.as_str(),
    media_type.subty.as_str(),
    media_type.suffix.map(|name| name.as_str()),
  );
  ty == "text" || (ty == "application" && (subty == "xml" || matches!(suffix, Some("xml"))))
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

    let zip = Mutex::new(zip);
    Ok(Archive { format, zip, files })
  }

  pub async fn read_file(&self, file: &str, media_type: MediaType<'_>) -> Result<FileContents> {
    debug!("Reading from archive file {file} of type {media_type}");

    let mut zip = self.zip.lock().await;
    let index = self
      .files
      .get(file)
      .with_context(|| format!("No entry in epub for file: {file}"))?;

    let reader = zip.reader_with_entry(*index).await?;

    if media_type_definitely_unicode(media_type) {
      let mut buffer = String::new();
      reader.compat().read_to_string(&mut buffer).await?;
      Ok(FileContents::Unicode(buffer))
    } else {
      let mut buffer = Vec::new();
      reader.compat().read_to_end(&mut buffer).await?;
      Ok(FileContents::Binary(buffer))
    }
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

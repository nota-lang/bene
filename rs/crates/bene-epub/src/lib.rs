//! A library for parsing EPUB files. Designed to avoid eagerly loading file contents into memory.

#![warn(clippy::pedantic)]
#![allow(clippy::single_match_else, clippy::must_use_candidate)]

use std::path::Path;

use anyhow::{anyhow, Context, Result};
use futures::future::try_join_all;
use log::debug;
use serde::{Deserialize, Serialize};

use ts_rs::TS;
pub use zip::{Archive, ArchiveFormat, FileZip, MemoryZip};

mod xhtml;
mod zip;

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Package {
  #[serde(rename = "@version")]
  pub version: String,
  #[serde(rename = "@unique-identifier")]
  pub unique_identifier: String,
  pub metadata: Metadata,
  pub manifest: Manifest,
  pub spine: Spine,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Metadata {
  #[serde(rename = "$value")]
  pub fields: Vec<MetaField>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub enum MetaField {
  #[serde(rename = "title")]
  Title(String),
  #[serde(rename = "language")]
  Language(String),
  #[serde(rename = "identifier")]
  Identifier(String),
  #[serde(rename = "creator")]
  Creator(String),
  #[serde(rename = "date")]
  Date(String),
  #[serde(other)]
  Unknown,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Manifest {
  #[serde(rename = "item", default)]
  pub items: Vec<Item>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Item {
  #[serde(rename = "@id")]
  pub id: String,
  #[serde(rename = "@href")]
  pub href: String,
  #[serde(rename = "@media-type")]
  pub media_type: String,
  #[serde(rename = "@properties")]
  pub properties: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Spine {
  #[serde(rename = "itemref", default)]
  pub itemrefs: Vec<ItemRef>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct ItemRef {
  #[serde(rename = "@idref")]
  pub idref: String,
}

#[derive(Serialize, TS, Clone)]
#[ts(export)]
pub struct Rendition {
  pub package: Package,
  pub root: String,
}

impl Rendition {
  /// Asynchronously loads a [`Rendition`] specified by its [`Rootfile`] from an [`Archive`].
  ///
  /// # Errors
  /// - If [`Rootfile::full_path`] does not specify a file.
  /// - If [`Rootfile::full_path`] fails to be read from the archive.
  /// - If the [`Rendition`] contents cannot be interpreted as UTF-8.
  /// - If the [`Rendition`] UTF-8 contents cannot be interpreted as XML.
  pub async fn load(archive: &mut Archive, rootfile: &Rootfile) -> Result<Self> {
    let root = Path::new(&rootfile.full_path)
      .parent()
      .ok_or_else(|| anyhow!("Rootfile path is not a file: {}", rootfile.full_path))?
      .display()
      .to_string();
    let package = archive.read_xml::<Package>(&rootfile.full_path).await?;
    debug!("Package: {package:#?}");

    Ok(Rendition { package, root })
  }

  /// Gets an [`Item`] by its [`Item::id`] from the rendition.
  ///
  /// Returns `None` if the [`Item::id`] is not contained in the rendition.
  pub fn item(&self, id: &str) -> Option<&Item> {
    let items = &self.package.manifest.items;
    items.iter().find(|item| item.id == id)
  }

  /// Returns the full path in the archive of a file in the rendition.
  pub fn file_path(&self, path: &str) -> String {
    format!("{}/{path}", self.root)
  }
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Container {
  #[serde(rename = "@version")]
  pub version: String,
  pub rootfiles: Rootfiles,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Rootfiles {
  #[serde(rename = "rootfile", default)]
  pub rootfiles: Vec<Rootfile>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Rootfile {
  #[serde(rename = "@full-path")]
  pub full_path: String,
  #[serde(rename = "@media-type")]
  pub media_type: String,
}

#[derive(Serialize, TS, Clone)]
#[ts(export)]
pub struct Epub {
  pub renditions: Vec<Rendition>,
}

impl Epub {
  /// Asynchronously loads an [`Epub`] from an [`Archive`].
  ///
  /// # Errors
  /// - If `META-INF/container.xml` cannot be read as a [`Container`].
  /// - If the [`Archive`] cannot be cloned with [`Archive::try_clone`].
  /// - If any [`Rendition`] fails to load with [`Rendition::load`].
  pub async fn load(archive: &mut Archive) -> Result<Self> {
    let container = archive
      .read_xml::<Container>("META-INF/container.xml")
      .await?;
    debug!("Container: {container:#?}");

    let rendition_futures = container.rootfiles.rootfiles.iter().map(async |rootfile| {
      let mut archive = archive.try_clone().await?;
      let rootfile = rootfile.clone();

      #[expect(
        clippy::missing_panics_doc,
        reason = "Rendition::load should be panic-free"
      )]
      tokio::spawn(async move { Rendition::load(&mut archive, &rootfile).await })
        .await
        .expect("Future panicked while loading rendition")
    });

    let renditions = try_join_all(rendition_futures)
      .await
      .context("Failed to load rendition")?;

    Ok(Epub { renditions })
  }

  /// Asynchronously loads a file from the EPUB's archive.
  ///
  /// TODO: Why does this function not need `self`? Is that a bug?
  ///
  /// # Errors
  /// - If the file fails to be read with [`Archive::read_file`].
  /// - If the file is XHTML and fails to be processed by [`xhtml::process_xhtml`].
  pub async fn load_asset(&self, archive: &mut Archive, path: &str) -> Result<Vec<u8>> {
    let contents = archive.read_file(path).await?;
    if Path::new(path)
      .extension()
      .is_some_and(|ext| ext.eq_ignore_ascii_case("xhtml"))
    {
      xhtml::process_xhtml(path, &contents)
    } else {
      Ok(contents)
    }
  }
}

pub fn guess_mime_type(path: &str) -> Option<String> {
  let guess = mime_guess::from_path(path);
  Some(match (guess.first(), path.split('.').next_back()?) {
    (_, "xhtml") => "text/html".to_string(),
    (Some(mime), _) => mime.to_string(),
    (None, ext) if ext == "tsx" || ext == "ts" => "text/javascript".to_string(),
    _ => "application/octet-stream".to_string(),
  })
}

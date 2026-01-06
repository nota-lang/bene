//! A library for parsing EPUB files. Designed to avoid eagerly loading file contents into memory.

#![warn(clippy::pedantic)]
#![allow(clippy::single_match_else, clippy::must_use_candidate)]

use std::{path::Path, string::FromUtf8Error};

use anyhow::{Context, Result, anyhow, ensure};
use log::trace;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::annotation::{Annotation, RawAnnotation};

pub use self::zip::{Archive, ArchiveFormat, FileZip, MemoryZip};

mod annotation;
mod cfi;
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
  #[serde(rename = "meta")]
  Meta {
    // This is required in EPUB 3.3, but some epubs seem to not have it for
    // attrs like <meta content="cover-image" name="cover"/>
    // so we make it optional for now.
    #[serde(rename = "@property")]
    property: Option<String>,
    #[serde(rename = "$text")]
    contents: Option<String>,
  },
  #[serde(other)]
  #[ts(skip)]
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
  #[serde(default)]
  pub itemref: Vec<ItemRef>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct ItemRef {
  #[serde(rename = "@id")]
  pub id: Option<String>,
  #[serde(rename = "@idref")]
  pub idref: String,
}

#[derive(Serialize, TS, Clone)]
#[ts(export)]
pub struct Rendition {
  pub package: Package,
  pub package_string: String,
  pub root: String,
}

impl Rendition {
  /// Loads a [`Rendition`] specified by its [`Rootfile`] from an [`Archive`].
  ///
  /// # Errors
  /// - If [`Rootfile::full_path`] does not specify a file.
  /// - If [`Rootfile::full_path`] fails to be read from the archive.
  /// - If the [`Rendition`] contents cannot be interpreted as UTF-8.
  /// - If the [`Rendition`] UTF-8 contents cannot be interpreted as XML.
  pub fn load(archive: &mut Archive, rootfile: &Rootfile) -> Result<Self> {
    let root = Path::new(&rootfile.full_path)
      .parent()
      .ok_or_else(|| anyhow!("Rootfile path is not a file: {}", rootfile.full_path))?
      .display()
      .to_string();
    let (package, package_string) = archive
      .read_xml::<Package>(&rootfile.full_path)
      .context("Failed while reading EPUB package file")?;
    trace!("Package: {package:#?}");

    Ok(Rendition {
      package,
      package_string,
      root,
    })
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

#[allow(unused)]
fn load_annotations(
  archive: &mut Archive,
  rendition: &Rendition,
) -> Result<Vec<Annotation>, anyhow::Error> {
  let annotation_item = rendition
    .package
    .manifest
    .items
    .iter()
    .find(|item| matches!(item.properties.as_deref(), Some("ppub:annotations")));
  let annotations = match annotation_item {
    Some(item) => {
      let annotations_path = rendition.file_path(&item.href);
      let raw_annotations = archive
        .read_json::<Vec<RawAnnotation>>(&annotations_path)
        .context("Error while parsing annotations file")?;
      annotation::process(raw_annotations).context("Error while processing raw annotations")?
    }
    None => Vec::new(),
  };
  Ok(annotations)
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
  /// The rootfiles element contains a list of package documents available in the EPUB container.
  #[serde(rename = "rootfile", default)]
  pub rootfiles: Vec<Rootfile>,
}

#[derive(Serialize, Deserialize, Debug, TS, Clone)]
#[ts(export)]
pub struct Rootfile {
  /// Identifies the location of a package document.
  #[serde(rename = "@full-path")]
  pub full_path: String,

  /// Identifies the media type of the package document.
  #[serde(rename = "@media-type")]
  pub media_type: String,
}

#[derive(Serialize, TS, Clone)]
#[ts(export)]
pub struct Epub {
  pub renditions: Vec<Rendition>,
}

impl Epub {
  /// Loads an [`Epub`] from an [`Archive`].
  ///
  /// # Errors
  /// - If `META-INF/container.xml` cannot be read as a [`Container`].
  /// - If the [`Archive`] cannot be cloned with [`Archive::try_clone`].
  /// - If any [`Rendition`] fails to load with [`Rendition::load`].
  pub fn load(archive: &mut Archive) -> Result<Self> {
    let (container, _) = archive
      .read_xml::<Container>("META-INF/container.xml")
      .context("Failed to read EPUB metadata")?;
    trace!("Container: {container:#?}");

    let renditions = container
      .rootfiles
      .rootfiles
      .iter()
      .map(|rootfile| {
        let mut archive = archive.try_clone()?;
        let rootfile = rootfile.clone();
        Rendition::load(&mut archive, &rootfile)
      })
      .collect::<Result<Vec<_>>>()?;

    ensure!(
      renditions
        .iter()
        .all(|rendition| rendition.package.version == "3.0"),
      "File is not in the EPUB 3 format"
    );

    Ok(Epub { renditions })
  }
}

/// Guesses the MIME type of a file based on its extension.
///
/// Uses [`mime_guess`] with a few EPUB-specific tweaks.
pub fn guess_mime_type(path: &str) -> Option<String> {
  let guess = mime_guess::from_path(path);
  Some(match (guess.first(), path.split('.').next_back()?) {
    // Note: we specifically want to serve XHTML files as text/html rather than application/xhtml+xml
    // so that they are rendered as HTML. This increases interoperability with Javascript frameworks which
    // generate non-XML HTML, which as of 1/6/26, included Lit.
    (_, "xhtml") => "text/html".to_string(),
    (Some(mime), _) => mime.to_string(),
    (None, ext) if ext == "tsx" || ext == "ts" => "text/javascript".to_string(),
    _ => "application/octet-stream".to_string(),
  })
}

/// Prepares an XHTML document for rendering as HTML.
///
/// # Errors
/// Errors if contents are not utf-8.
pub fn htmlify_xhtml(contents: Vec<u8>) -> Result<Vec<u8>, FromUtf8Error> {
  let mut s = String::from_utf8(contents)?;
  if !s.starts_with("<!") {
    s.insert_str(0, "<!doctype html>");
  }
  Ok(s.into_bytes())
}

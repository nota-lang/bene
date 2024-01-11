use std::path::Path;

use anyhow::{Context, Result};
use futures::future::try_join_all;
use log::debug;
use serde::{Deserialize, Serialize};

pub use zip::{Archive, ArchiveFormat, FileZip, MemoryZip};

mod zip;

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Package {
  #[serde(rename = "@version")]
  pub version: String,
  #[serde(rename = "@unique-identifier")]
  pub unique_identifier: String,
  pub metadata: Metadata,
  pub manifest: Manifest,
  pub spine: Spine,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Metadata {
  #[serde(rename = "$value")]
  pub fields: Vec<MetaField>,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
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

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Manifest {
  #[serde(rename = "item", default)]
  pub items: Vec<Item>,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
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

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Spine {
  #[serde(rename = "itemref", default)]
  pub itemrefs: Vec<ItemRef>,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct ItemRef {
  #[serde(rename = "@idref")]
  pub idref: String,
}

#[derive(Serialize, specta::Type, Clone)]
pub struct Rendition {
  pub package: Package,
  pub root: String,
}

impl Rendition {
  pub async fn load(archive: &mut Archive, rootfile: &Rootfile) -> Result<Self> {
    let root = Path::new(&rootfile.full_path)
      .parent()
      .unwrap()
      .display()
      .to_string();
    let package_str = String::from_utf8(archive.read_file(&rootfile.full_path).await?)?;
    let package: Package =
      quick_xml::de::from_str(&package_str).context("Failed to parse package XML file")?;
    debug!("Package: {package:#?}");

    Ok(Rendition { root, package })
  }

  pub fn item(&self, id: &str) -> &Item {
    let items = &self.package.manifest.items;
    items
      .iter()
      .find(|item| item.id == id)
      .unwrap_or_else(|| panic!("Could not find item with id: {id}"))
  }

  pub fn file_path(&self, path: &str) -> String {
    format!("{}/{path}", self.root)
  }
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Container {
  #[serde(rename = "@version")]
  pub version: String,
  pub rootfiles: Rootfiles,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Rootfiles {
  #[serde(rename = "rootfile", default)]
  pub rootfiles: Vec<Rootfile>,
}

#[derive(Serialize, Deserialize, Debug, specta::Type, Clone)]
pub struct Rootfile {
  #[serde(rename = "@full-path")]
  pub full_path: String,
  #[serde(rename = "@media-type")]
  pub media_type: String,
}

#[derive(Serialize, specta::Type, Clone)]
pub struct Epub {
  pub renditions: Vec<Rendition>,
}

impl Epub {
  pub async fn load(archive: &mut Archive) -> Result<Self> {
    let container_str = String::from_utf8(archive.read_file("META-INF/container.xml").await?)?;
    let container: Container =
      quick_xml::de::from_str(&container_str).context("Failed to parse container.xml")?;
    debug!("Container: {container:#?}");

    let rendition_futures = container.rootfiles.rootfiles.iter().map(|rootfile| async {
      let mut archive = archive.try_clone().await?;
      let rootfile = rootfile.clone();
      tokio::spawn(async move { Rendition::load(&mut archive, &rootfile).await })
        .await
        .unwrap()
    });
    let renditions = try_join_all(rendition_futures)
      .await
      .context("Failed to load rendition")?;

    Ok(Epub { renditions })
  }
}

pub fn guess_mime_type(path: &str) -> String {
  let guess = mime_guess::from_path(path);
  match (guess.first(), path.split('.').last().unwrap()) {
    (_, "xhtml") => "text/html".to_string(),
    (Some(mime), _) => mime.to_string(),
    (None, ext) if ext == "tsx" || ext == "ts" => "text/javascript".to_string(),
    _ => "application/octet-stream".to_string(),
  }
}

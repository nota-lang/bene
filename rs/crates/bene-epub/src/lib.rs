use std::path::Path;

use anyhow::{Context, Result};
use futures::future::try_join_all;
use log::debug;
use mediatype::MediaType;
use serde::{Deserialize, Serialize};

pub use zip::{Archive, ArchiveFormat, FileContents, FileZip, MemoryZip};

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
  pub async fn load(archive: Archive, rootfile: &Rootfile) -> Result<Self> {
    let root = Path::new(&rootfile.full_path)
      .parent()
      .unwrap()
      .display()
      .to_string();
    let media_type = MediaType::parse(&rootfile.media_type)?;
    let package_str = archive
      .read_file(&rootfile.full_path, media_type)
      .await?
      .unwrap_unicode();
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

  // pub async fn load_asset(&self, path: String) -> Option<AssetResponse> {
  //   let media_type = MediaType::parse("application/octet-stream").unwrap();
  //   let contents = match self.load_file(&path, media_type).await {
  //     Ok(contents) => contents,
  //     Err(e) => {
  //       warn!("Failed to load asset with error {}", e);
  //       return None;
  //     }
  //   };

  //   let response = Response::builder()
  //     .header("Content-Type", "application/octet-stream")
  //     .body(Cow::from(contents.unwrap_binary()))
  //     .unwrap();

  //   Some(response)
  // }
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

const XML_MEDIATYPE: MediaType<'_> =
  MediaType::new(mediatype::names::APPLICATION, mediatype::names::XML);

impl Epub {
  pub async fn load(archive: &Archive) -> Result<Self> {
    let container_str = archive
      .read_file("META-INF/container.xml", XML_MEDIATYPE)
      .await?
      .unwrap_unicode();
    let container: Container =
      quick_xml::de::from_str(&container_str).context("Failed to parse container.xml")?;
    debug!("Container: {container:#?}");

    let rendition_futures = container.rootfiles.rootfiles.iter().map(|rootfile| async {
      let archive = archive.try_clone().await?;
      let rootfile = rootfile.clone();
      tokio::spawn(async move { Rendition::load(archive, &rootfile).await })
        .await
        .unwrap()
    });
    let renditions = try_join_all(rendition_futures)
      .await
      .context("Failed to load rendition")?;

    Ok(Epub { renditions })
  }
}

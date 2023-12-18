// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use anyhow::Result;
use bene_epub::{Archive, Epub, FileZip};
use clap::Parser;
use mediatype::MediaType;
use serde::{Deserialize, Serialize};
use tauri::{App, Manager};
use tokio::{sync::Mutex, task::JoinHandle};

#[derive(Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct ClientLoaded {}

type EpubCell = Mutex<Option<JoinHandle<Result<(Epub, Archive)>>>>;

#[tauri::command]
#[specta::specta]
async fn epub(window: tauri::Window, handle: tauri::State<'_, EpubCell>) -> Result<Epub, String> {
  match window.try_state::<Epub>() {
    Some(epub) => Ok((*epub).clone()),
    None => {
      let mut handle = handle.lock().await;
      let handle = handle
        .take()
        .ok_or_else(|| "Cannot call epub while epub is loading!".to_string())?;
      let (epub, archive) = handle
        .await
        .map_err(|e| format!("{e:?}"))?
        .map_err(|e| format!("{e:?}"))?;
      window.manage(epub.clone());
      window.manage(archive);
      Ok(epub)
    }
  }
}

#[tauri::command]
#[specta::specta]
async fn chapter(
  rendition: u32,
  epub: tauri::State<'_, Epub>,
  archive: tauri::State<'_, Archive>,
  id: &str,
) -> Result<String, String> {
  let rendition = &epub.renditions[rendition as usize];
  let item = rendition.item(id);
  let media_type = MediaType::parse(&item.media_type).map_err(|e| format!("{e:?}"))?;
  let file = archive
    .read_file(&rendition.file_path(&item.href), media_type)
    .await
    .map_err(|e| format!("{e:?}"))?;
  Ok(file.unwrap_unicode())
}

#[derive(Parser)]
struct CliArgs {
  /// Path to .epub file
  path: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
  env_logger::init();
  let args = CliArgs::parse();
  let epub_handle: EpubCell = Mutex::new(Some(tokio::spawn(async move {
    let archive = Archive::load(FileZip(args.path)).await?;
    let epub = Epub::load(&archive).await?;
    Ok((epub, archive))
  })));

  let setup = |_app: &mut App| Ok(());

  macro_rules! handlers {
    ($macro:ident) => {
      $macro![epub, chapter]
    };
  }

  let specta_plugin = {
    use tauri_specta::{collect_commands, collect_events};
    let specta_builder = tauri_specta::ts::builder()
      .commands(handlers!(collect_commands))
      .events(collect_events![ClientLoaded]);

    #[cfg(debug_assertions)] // Only export on non-release builds
    let specta_builder =
      specta_builder.path("../../../js/packages/bene-app-desktop/src/bindings.ts");

    specta_builder.into_plugin()
  };

  // Since we started Tokio ourselves, need to inform Tauri about the existing runtime.
  tauri::async_runtime::set(tokio::runtime::Handle::current());

  // Launch the Tauri app.
  use tauri::generate_handler;
  tauri::Builder::default()
    .plugin(specta_plugin)
    .invoke_handler(handlers!(generate_handler))
    .manage(epub_handle)
    .setup(setup)
    .run(tauri::generate_context!())?;

  Ok(())
}

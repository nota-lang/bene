// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(clippy::pedantic)]
#![allow(clippy::single_match_else)]

use std::{borrow::Cow, path::PathBuf, sync::Arc};

use anyhow::{Context, Result, anyhow};
use bene_epub::{Archive, Epub, FileZip};
use clap::Parser;
use log::warn;
use tauri::{App, AppHandle, Manager, http};
use tokio::{runtime::Handle, sync::Mutex, task::JoinHandle};

type EpubCell = Mutex<Option<JoinHandle<Result<Epub>>>>;

#[tauri::command]
async fn epub(window: tauri::Window, handle: tauri::State<'_, EpubCell>) -> Result<Epub, String> {
  match window.try_state::<Epub>() {
    Some(epub) => Ok((*epub).clone()),
    None => {
      let mut handle = handle.lock().await;
      let handle = handle
        .take()
        .ok_or_else(|| "Cannot call epub() while epub is loading!".to_string())?;
      let epub = handle
        .await
        .map_err(|e| format!("{e:?}"))?
        .map_err(|e| format!("{e:?}"))?;
      window.manage(epub.clone());
      Ok(epub)
    }
  }
}

#[derive(Parser)]
struct CliArgs {
  /// Path to .epub file
  path: PathBuf,
}

async fn load_reader_asset(app: &AppHandle, path: &str) -> Result<Vec<u8>> {
  let path = format!(
    "{}/bene-reader{path}",
    app.config().build.frontend_dist.as_ref().unwrap()
  );
  Ok(tokio::fs::read(path).await?)
}

async fn load_epub_asset(
  epub: &Epub,
  archive: &Arc<Mutex<Archive>>,
  path: &str,
) -> Result<Vec<u8>> {
  let mut archive = archive.lock().await;
  epub.load_asset(&mut archive, path).await
}

async fn serve_asset(
  app: &AppHandle,
  archive: &Arc<Mutex<Archive>>,
  request: http::Request<Vec<u8>>,
) -> http::Response<Cow<'static, [u8]>> {
  let path = request.uri().path();
  let (result, path) = match path.strip_prefix("/epub-content/") {
    Some(epub_path) => match app.try_state::<Epub>() {
      Some(epub) => (load_epub_asset(&epub, archive, epub_path).await, epub_path),
      None => (Err(anyhow!("Epub not loaded yet")), epub_path),
    },
    None => (load_reader_asset(app, path).await, path),
  };
  match result {
    Ok(contents) => {
      let mut response = http::Response::builder().status(http::StatusCode::OK);
      match bene_epub::guess_mime_type(path) {
        Some(content_type) => response = response.header("Content-Type", content_type),
        None => warn!("Unknown content type for path: {path}"),
      }
      response.body(Cow::Owned(contents)).unwrap()
    }
    Err(e) => {
      warn!("Failed to read asset {path} with error {e}");
      http::Response::builder()
        .status(http::StatusCode::NOT_FOUND)
        .body(Cow::Owned(vec![]))
        .unwrap()
    }
  }
}

#[tokio::main]
async fn main() -> Result<()> {
  let args = CliArgs::parse();

  let archive = Archive::load(FileZip(args.path))
    .await
    .context("Failed to parse epub as zip")?;

  let mut archive_clone = archive.try_clone().await?;
  let epub_handle: EpubCell = Mutex::new(Some(tokio::spawn(async move {
    Epub::load(&mut archive_clone).await
  })));

  #[allow(unused_variables)]
  let setup = |app: &mut App| {
    #[cfg(debug_assertions)]
    {
      let window = app.get_webview_window("main").unwrap();
      window.open_devtools();
    }
    Ok(())
  };

  // Since we started Tokio ourselves, need to inform Tauri about the existing runtime.
  tauri::async_runtime::set(Handle::current());

  // Launch the Tauri app.
  let archive_clone = archive.try_clone().await?;
  let archive = Arc::new(Mutex::new(archive));
  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![epub])
    .manage(epub_handle)
    .manage(archive_clone)
    .setup(setup)
    .register_asynchronous_uri_scheme_protocol("bene", move |ctx, request, responder| {
      let archive = Arc::clone(&archive);
      let app = ctx.app_handle().clone();
      tokio::spawn(async move {
        let response = serve_asset(&app, &archive, request).await;
        responder.respond(response);
      });
    })
    .run(tauri::generate_context!())?;

  Ok(())
}

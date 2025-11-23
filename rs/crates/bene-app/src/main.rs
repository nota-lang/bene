// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(clippy::pedantic)]
#![allow(clippy::single_match_else)]

use std::{borrow::Cow, fmt::Write, path::PathBuf};

use anyhow::{Context, Result, anyhow};
use bene_epub::{Archive, Epub, FileZip};
use cfg_if::cfg_if;
use clap::Parser;
use futures::future::try_join_all;
use log::warn;
use tauri::{App, AppHandle, Manager, State, http, utils::config::FrontendDist};
use tokio::{
  runtime::Handle,
  sync::{Mutex, MutexGuard},
};

#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", content = "value")]
enum AppState {
  Waiting,
  Loading,
  Error(String),
  Ready(Epub),
}

#[tauri::command]
async fn state(state: State<'_, Mutex<AppState>>) -> Result<AppState, String> {
  Ok(state.lock().await.clone())
}

#[derive(Parser)]
struct CliArgs {
  /// Path to .epub file
  path: Option<PathBuf>,
}

async fn load_reader_asset(app: &AppHandle, local_path: &str) -> Result<Vec<u8>> {
  let mut full_path = String::new();
  if cfg!(dev) {
    let FrontendDist::Directory(dir) = app.config().build.frontend_dist.as_ref().unwrap() else {
      unreachable!()
    };
    write!(full_path, "{}/../../bene-reader/dist", dir.display())?;
  } else {
    write!(
      full_path,
      "{}/bene-reader",
      app.path().resource_dir().unwrap().display()
    )?;
  }
  full_path.push_str(local_path);

  tokio::fs::read(&full_path)
    .await
    .with_context(|| format!("Failed to read: {full_path}"))
}

async fn serve_asset(
  app: &AppHandle,
  request: http::Request<Vec<u8>>,
) -> http::Response<Cow<'static, [u8]>> {
  let path = request.uri().path();
  let (result, path) = match path.strip_prefix("/epub-content/") {
    Some(epub_path) => match (
      &*app.state::<Mutex<AppState>>().inner().lock().await,
      app.try_state::<ArchivePool>(),
    ) {
      (AppState::Ready(epub), Some(pool)) => {
        let mut archive = pool.lock_one().await;
        (epub.load_asset(&mut archive, epub_path).await, epub_path)
      }
      _ => (Err(anyhow!("Epub not loaded yet")), epub_path),
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

const POOL_SIZE: usize = 8;

struct ArchivePool {
  pool: Vec<Mutex<Archive>>,
}

impl ArchivePool {
  async fn new(archive: Archive) -> Result<Self> {
    let pool = try_join_all(
      (0..POOL_SIZE).map(async |_| Ok::<_, anyhow::Error>(Mutex::new(archive.try_clone().await?))),
    )
    .await?;
    Ok(ArchivePool { pool })
  }

  async fn lock_one(&self) -> MutexGuard<'_, Archive> {
    for archive in &self.pool {
      if let Ok(archive) = archive.try_lock() {
        return archive;
      }
    }

    self.pool[0].lock().await
  }
}

async fn load_epub(app: AppHandle, path: PathBuf) {
  let app = &app;
  *app.state::<Mutex<AppState>>().lock().await = AppState::Loading;
  let state = async {
    let mut archive = Archive::load(FileZip(path))
      .await
      .context("Failed to parse epub as zip")?;
    let epub = Epub::load(&mut archive).await?;
    let archive = ArchivePool::new(archive).await?;
    app.manage(archive);
    Ok(AppState::Ready(epub))
  }
  .await
  .unwrap_or_else(|err: anyhow::Error| AppState::Error(format!("{err:?}")));
  *app.state::<Mutex<AppState>>().lock().await = state;
}

#[tokio::main]
async fn main() -> Result<()> {
  let args = CliArgs::parse();

  tauri::async_runtime::set(Handle::current());

  #[allow(unused_variables)]
  let setup = |app: &mut App| {
    #[cfg(debug_assertions)]
    {
      let window = app.get_webview_window("main").unwrap();
      window.open_devtools();
    }

    if let Some(path) = args.path {
      let handle = app.handle().clone();
      tokio::spawn(load_epub(handle, path));
    }

    Ok(())
  };

  let builder = tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .setup(setup)
    .manage(Mutex::new(AppState::Waiting))
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![state])
    .register_asynchronous_uri_scheme_protocol("bene", move |ctx, request, responder| {
      let app = ctx.app_handle().clone();
      tokio::spawn(async move {
        let response = serve_asset(&app, request).await;
        responder.respond(response);
      });
    });

  let app = builder.build(tauri::generate_context!())?;

  // On MacOS only, the "open file with" interaction is translated into
  // a `RunEvent::Opened` event. On all other platforms, it is a CLI argument.
  cfg_if! {
    if #[cfg(any(target_os = "macos", target_os = "ios"))] {
      app.run(|app, event| {
        if let tauri::RunEvent::Opened { urls } = event {
          let path = PathBuf::from(urls[0].path());
          let handle = app.clone();
          tokio::spawn(load_epub(handle, path));
        }
      });
    } else {
      app.run(|_, _| {});
    }
  }

  Ok(())
}

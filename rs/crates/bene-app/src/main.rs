// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![warn(clippy::pedantic)]
#![allow(
  clippy::single_match_else,
  clippy::needless_pass_by_value,
  clippy::redundant_else
)]

use std::{
  borrow::Cow,
  fmt::Write,
  fs,
  path::PathBuf,
  sync::{Mutex, MutexGuard},
};

use anyhow::{Context, Result, anyhow};
use bene_epub::{Archive, Epub, FileZip};
use cfg_if::cfg_if;
use clap::Parser;
use log::{debug, warn};
use notify::Watcher as _;
use tauri::{
  App, AppHandle, Emitter, Manager, State, async_runtime, http, utils::config::FrontendDist,
};

struct LocalState {
  archive: ArchivePool,
  _watcher: Watcher,
}

#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", content = "value")]
enum SharedState {
  Waiting,
  Loading,
  Error(String),
  Ready(Epub),
}

type SharedStateLock = Mutex<SharedState>;
type LocalStateLock = Mutex<Option<LocalState>>;

fn set_shared_state(app: &AppHandle, state: SharedState) {
  *app.state::<SharedStateLock>().lock().unwrap() = state.clone();
  app
    .emit("state", state)
    .expect("Failed to emit `state` event");
  debug!("Emitting event");
}

#[tauri::command]
fn state(state: State<'_, SharedStateLock>) -> SharedState {
  state.lock().unwrap().clone()
}

#[tauri::command]
fn upload(handle: AppHandle, path: PathBuf) {
  load_epub(handle, path);
}

#[derive(Parser)]
struct CliArgs {
  /// Path to .epub file
  path: Option<PathBuf>,
}

fn load_reader_asset(app: &AppHandle, local_path: &str) -> Result<Vec<u8>> {
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

  fs::read(&full_path).with_context(|| format!("Failed to read: {full_path}"))
}

fn serve_asset(
  app: &AppHandle,
  request: http::Request<Vec<u8>>,
) -> http::Response<Cow<'static, [u8]>> {
  let path = request.uri().path();
  let state = app.state::<LocalStateLock>();
  let (result, path) = match path.strip_prefix("/epub-content/") {
    Some(epub_path) => match &*state.lock().unwrap() {
      Some(state) => {
        let mut archive = state.archive.lock_one();
        (archive.read_file(epub_path), epub_path)
      }
      None => (Err(anyhow!("Epub not loaded yet")), epub_path),
    },
    None => (load_reader_asset(app, path), path),
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

const ARCHIVE_POOL_SIZE: usize = 8;

struct ArchivePool {
  pool: Vec<Mutex<Archive>>,
}

impl ArchivePool {
  fn new(archive: Archive) -> Result<Self> {
    let pool = (0..ARCHIVE_POOL_SIZE)
      .map(|_| Ok(Mutex::new(archive.try_clone()?)))
      .collect::<Result<Vec<_>>>()?;
    Ok(ArchivePool { pool })
  }

  fn lock_one(&self) -> MutexGuard<'_, Archive> {
    for archive in &self.pool {
      if let Ok(archive) = archive.try_lock() {
        return archive;
      }
    }

    self.pool[0].lock().unwrap()
  }
}

struct Watcher {
  _watcher: notify::RecommendedWatcher,
  _watch_task: async_runtime::JoinHandle<()>,
}

impl Watcher {
  fn new(app: &AppHandle, path: PathBuf) -> Result<Self> {
    let (tx, mut rx) = async_runtime::channel(64);
    let mut watcher = notify::recommended_watcher(move |e| {
      if let Err(err) = tx.blocking_send(e) {
        warn!("Failed to send event to watch task: {err:?}");
      }
    })?;
    watcher.watch(&path, notify::RecursiveMode::NonRecursive)?;

    let app2 = app.clone();
    let watch_task = async_runtime::spawn(async move {
      while let Some(res) = rx.recv().await {
        match res {
          Ok(event) => match &event.kind {
            notify::EventKind::Modify(notify::event::ModifyKind::Data(_)) => {
              let shared_state_lock = app2.state::<SharedStateLock>();
              if matches!(*shared_state_lock.lock().unwrap(), SharedState::Ready(_)) {
                load_epub(app2, path);
                return;
              } else {
                debug!("Received file update while loading EPUB, ignoring");
              }
            }

            _ => debug!("Received unhandled file watcher event: {event:?}"),
          },
          Err(err) => {
            warn!("File watcher received error: {err:?}");
            break;
          }
        }
      }
    });

    Ok(Watcher {
      _watcher: watcher,
      _watch_task: watch_task,
    })
  }
}

fn load_epub(app: AppHandle, path: PathBuf) {
  debug!("Loading EPUB from path: {}", path.display());
  set_shared_state(&app, SharedState::Loading);

  async_runtime::spawn_blocking(move || {
    let (local_state, shared_state) = (|| {
      let path = path.canonicalize()?;
      let mut archive =
        Archive::load(FileZip(path.clone())).context("Failed to parse epub as zip")?;
      let epub = Epub::load(&mut archive)?;
      let archive = ArchivePool::new(archive)?;
      let watcher = Watcher::new(&app, path)?;

      let local_state = Some(LocalState {
        archive,
        _watcher: watcher,
      });
      let shared_state = SharedState::Ready(epub);
      Ok((local_state, shared_state))
    })()
    .unwrap_or_else(|err: anyhow::Error| (None, SharedState::Error(format!("{err:?}"))));

    *app.state::<LocalStateLock>().lock().unwrap() = local_state;
    set_shared_state(&app, shared_state);
  });
}

fn main() -> Result<()> {
  let args = CliArgs::parse();

  #[allow(unused_variables)]
  let setup = |app: &mut App| {
    #[cfg(debug_assertions)]
    {
      let window = app.get_webview_window("main").unwrap();
      window.open_devtools();
    }

    if let Some(path) = args.path {
      let handle = app.handle().clone();
      load_epub(handle, path);
    }

    Ok(())
  };

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Debug)
        .build(),
    )
    .setup(setup)
    .manage::<SharedStateLock>(Mutex::new(SharedState::Waiting))
    .manage::<LocalStateLock>(Mutex::new(None))
    .invoke_handler(tauri::generate_handler![state, upload])
    .register_asynchronous_uri_scheme_protocol("bene", move |ctx, request, responder| {
      let app = ctx.app_handle().clone();
      async_runtime::spawn_blocking(move || {
        let response = serve_asset(&app, request);
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
          load_epub(handle, path);
        }
      });
    } else {
      app.run(|_, _| {});
    }
  }

  Ok(())
}

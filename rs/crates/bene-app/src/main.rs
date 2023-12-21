// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{borrow::Cow, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use bene_epub::{Archive, Epub, FileZip};
use clap::Parser;
use log::warn;
use tauri::{http, App, AppHandle, Manager};
use tokio::{runtime::Handle, sync::Mutex, task::JoinHandle};

type EpubCell = Mutex<Option<JoinHandle<Result<Epub>>>>;

#[tauri::command]
// #[specta::specta]
async fn epub(window: tauri::Window, handle: tauri::State<'_, EpubCell>) -> Result<Epub, String> {
  match window.try_state::<Epub>() {
    Some(epub) => Ok((*epub).clone()),
    None => {
      let mut handle = handle.lock().await;
      let handle = handle
        .take()
        .ok_or_else(|| "Cannot call epub while epub is loading!".to_string())?;
      let epub = handle
        .await
        .map_err(|e| format!("{e:?}"))?
        .map_err(|e| format!("{e:?}"))?;
      window.manage(epub.clone());
      Ok(epub)
    }
  }
}

// fn process_html(src: &str) -> Result<String> {
//   let mut reader = quick_xml::Reader::from_str(src);
//   let mut output: Vec<u8> = Vec::new();

//   loop {
//     match reader.read_event()? {
//       Event::Text(text) => output.extend(text.into_iter()),
//       Event::Start(start) => start.name(),
//       Event::Eof => break,
//       _ => {}
//     }
//   }

//   Ok(String::new())
// }

#[derive(Parser)]
struct CliArgs {
  /// Path to .epub file
  path: PathBuf,
}

fn guess_mime_type(path: &str) -> String {
  let guess = mime_guess::from_path(path);
  match (guess.first(), path.split_once('.')) {
    (Some(mime), _) => mime.to_string(),
    (None, Some((_, ext))) if ext == "tsx" || ext == "ts" => "text/javascript".to_string(),
    _ => "application/octet-stream".to_string(),
  }
}

async fn serve_asset(
  _app: &AppHandle,
  archive: &Arc<Mutex<Archive>>,
  request: http::Request<Vec<u8>>,
) -> http::Response<Cow<'static, [u8]>> {
  let path = request.uri().path();
  match path.strip_prefix("/epub/") {
    Some(epub_path) => {
      log::debug!("Received EPUB request for {epub_path}");
      let mut archive = archive.lock().await;
      match archive.read_file(epub_path).await {
        Ok(contents) => http::Response::builder()
          .status(http::StatusCode::OK)
          .header("Content-Type", guess_mime_type(epub_path))
          .body(Cow::Owned(contents))
          .unwrap(),
        Err(e) => {
          warn!("Failed to read asset {epub_path} with error {e}");
          http::Response::builder()
            .status(http::StatusCode::NOT_FOUND)
            .body(Cow::Owned(vec![]))
            .unwrap()
        }
      }
    }
    None => {
      log::debug!("Received top-level request for {path}");

      // TODO: THIS WILL NOT WORK IN PRODUCTION
      let new_path = format!("http://localhost:5173{path}");
      let reqwest_response = reqwest::get(new_path).await.unwrap();
      let mut http_response = http::Response::builder();
      let headers = http_response.headers_mut().unwrap();
      *headers = reqwest_response.headers().clone();
      let body = reqwest_response.bytes().await.unwrap();
      http_response.body(Cow::Owned(body.into())).unwrap()
    }
  }
}

#[tokio::main]
async fn main() -> Result<()> {
  env_logger::init();
  let args = CliArgs::parse();

  let archive = Archive::load(FileZip(args.path))
    .await
    .context("Failed to parse epub as zip")?;

  let mut archive_clone = archive.try_clone().await?;
  let epub_handle: EpubCell = Mutex::new(Some(tokio::spawn(async move {
    Epub::load(&mut archive_clone).await
  })));

  let setup = |app: &mut App| {
    #[cfg(debug_assertions)] // only include this code on debug builds
    {
      let window = app.get_window("main").unwrap();
      window.open_devtools();
    }
    Ok(())
  };

  macro_rules! handlers {
    ($macro:ident) => {
      $macro![epub]
    };
  }

  // let specta_plugin = {
  //   use tauri_specta::collect_commands;
  //   let specta_builder = tauri_specta::ts::builder().commands(handlers!(collect_commands));

  //   #[cfg(debug_assertions)] // Only export on non-release builds
  //   let specta_builder =
  //     specta_builder.path("../../../js/packages/bene-app-desktop/src/bindings.ts");

  //   specta_builder.into_plugin()
  // };

  // Since we started Tokio ourselves, need to inform Tauri about the existing runtime.
  tauri::async_runtime::set(Handle::current());

  // Launch the Tauri app.
  use tauri::generate_handler;
  let archive_clone = archive.try_clone().await?;
  let archive = Arc::new(Mutex::new(archive));
  tauri::Builder::default()
    // .plugin(specta_plugin)
    .invoke_handler(handlers!(generate_handler))
    .manage(epub_handle)
    .manage(archive_clone)
    .setup(setup)
    .register_asynchronous_uri_scheme_protocol("bene", move |app, request, responder| {
      let archive = Arc::clone(&archive);
      let app = app.clone();
      tokio::spawn(async move {
        let response = serve_asset(&app, &archive, request).await;
        responder.respond(response);
      });
    })
    .run(tauri::generate_context!())?;

  Ok(())
}

// #[test]
// fn ok() {
//   process_html(
//     r#"
// <!DOCTYPE html>
// <html lang="en">
//   <head></head>
//   <body></body>
// </html>
// "#,
//   )
//   .unwrap();
// }

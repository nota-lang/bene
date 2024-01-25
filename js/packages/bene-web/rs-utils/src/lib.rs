use bene_epub::{Archive, Epub, MemoryZip};
use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct EpubCtxt {
  epub: Epub,
  archive: Archive,
}

#[wasm_bindgen]
impl EpubCtxt {
  pub fn metadata(&self) -> String {
    serde_json::to_string(&self.epub).unwrap()
  }

  pub fn read_file(&mut self, path: &str) -> Result<Uint8Array, JsError> {
    let runtime = tokio::runtime::Builder::new_current_thread().build()?;
    let _guard = runtime.enter();
    runtime.block_on(async {
      let contents = self
        .epub
        .load_asset(&mut self.archive, path)
        .await
        .map_err(|err| JsError::new(&err.to_string()))?;
      Ok(Uint8Array::from(contents.as_slice()))
    })
  }
}

#[wasm_bindgen]
pub fn init_rs() -> Result<(), JsError> {
  std::panic::set_hook(Box::new(console_error_panic_hook::hook));
  Ok(())
}

#[wasm_bindgen]
pub fn load_epub(data: Vec<u8>) -> Result<EpubCtxt, JsError> {
  let runtime = tokio::runtime::Builder::new_current_thread().build()?;
  let _guard = runtime.enter();
  runtime.block_on(async {
    let mut archive = Archive::load(MemoryZip(data.into()))
      .await
      .map_err(|err| JsError::new(&err.to_string()))?;
    let epub = Epub::load(&mut archive)
      .await
      .map_err(|err| JsError::new(&err.to_string()))?;
    Ok(EpubCtxt { epub, archive })
  })
}

#[wasm_bindgen]
pub fn guess_mime_type(url: &str) -> String {
  bene_epub::guess_mime_type(url)
}

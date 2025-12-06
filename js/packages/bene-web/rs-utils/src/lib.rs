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
    let contents = self
      .epub
      .load_asset(&mut self.archive, path)
      .map_err(|err| JsError::new(&err.to_string()))?;
    Ok(Uint8Array::from(contents.as_slice()))
  }
}

#[wasm_bindgen]
pub fn init_rs() -> Result<(), JsError> {
  std::panic::set_hook(Box::new(console_error_panic_hook::hook));
  Ok(())
}

#[wasm_bindgen]
pub fn load_epub(data: Vec<u8>) -> Result<EpubCtxt, JsError> {
  let mut archive =
    Archive::load(MemoryZip(data.into())).map_err(|err| JsError::new(&err.to_string()))?;
  let epub = Epub::load(&mut archive).map_err(|err| JsError::new(&err.to_string()))?;
  Ok(EpubCtxt { epub, archive })
}

#[wasm_bindgen]
pub fn guess_mime_type(url: &str) -> String {
  bene_epub::guess_mime_type(url).expect("No mime type!")
}

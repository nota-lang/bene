use bene_epub::{Epub, MemoryZip};
use wasm_bindgen::prelude::*;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub async fn test(data: Vec<u8>) -> Result<(), JsError> {
  let epub = Epub::load(MemoryZip(data.into()))
    .await
    .map_err(|err| JsError::new(&err.to_string()))?;
  Ok(())
}

//! Preprocessing of XHTML files to be rendered as HTML by the browser.
//!
//! TODO: Should this live in bene-app?

use std::io::Cursor;

use anyhow::Result;
use itertools::Itertools;
use quick_xml::{
  events::{BytesStart, Event},
  Reader, Writer,
};

fn css_link_elem(href: &str) -> Event<'_> {
  let mut elem = BytesStart::new("link");
  elem.extend_attributes([("rel", "stylesheet"), ("type", "text/css"), ("href", href)]);
  Event::Empty(elem)
}

pub fn process_xhtml(path: &str, input: &[u8]) -> Result<Vec<u8>> {
  let mut reader = Reader::from_reader(input);
  let mut writer = Writer::new(Cursor::new(Vec::new()));
  loop {
    let event = reader.read_event()?;
    match &event {
      Event::End(end) => {
        if end.local_name().as_ref() == b"head" {
          let num_segments = path.split('/').count();
          let reader_root = (0..num_segments).map(|_| "..").collect_vec().join("/");

          let href = format!("{reader_root}/content.css");
          writer.write_event(css_link_elem(&href))?;
        }
      }
      Event::Eof => break,
      _ => {}
    }
    writer.write_event(event)?;
  }
  Ok(writer.into_inner().into_inner())
}

#[test]
fn xhtml() {
  let input = r#"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html>
  <head>
  </head>
  <body>
  </body>
</html>"#;
  let path = "EPUB/index.xhtml";
  let actual_bytes = process_xhtml(path, input.as_bytes()).unwrap();
  let actual = String::from_utf8(actual_bytes).unwrap();
  let expected = r#"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html>
  <head>
  <link rel="stylesheet" type="text/css" href="../../content.css"/></head>
  <body>
  </body>
</html>"#;
  assert_eq!(actual, expected);
}

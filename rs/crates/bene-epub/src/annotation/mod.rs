use anyhow::{bail, ensure, Result};
use iref::IriRefBuf;
use serde::Serialize;
use ts_rs::TS;

mod raw;

#[cfg(test)]
mod raw_tests;

pub use raw::Annotation as RawAnnotation;

use crate::annotation::raw::IntoVec;

#[derive(Serialize, TS, Clone)]
#[ts(export)]
pub struct Annotation {
  pub selector: String,
  pub body: Option<String>,
}

pub fn process(annotations: Vec<RawAnnotation>) -> Result<Vec<Annotation>> {
  annotations
    .into_iter()
    .map(|raw_annot| {
      let mut raw_targets = raw_annot.target.into_vec();
      ensure!(
        raw_targets.len() == 1,
        "cannot handle multiple annotation targets"
      );
      let raw_target = raw_targets.remove(0);
      let selector = match raw_target {
        raw::Target::SpecificResource(resource) => {
          let mut raw_selectors = resource.selector.into_vec();
          ensure!(
            raw_selectors.len() == 1,
            "cannot handle multiple annotation selectors"
          );
          let raw_selector = raw_selectors.remove(0);
          match raw_selector {
            raw::Selector::TaggedSelector(raw::TaggedSelector::FragmentSelector(fragment)) => {
              ensure!(
                matches!(
                  fragment.conforms_to.as_ref().map(IriRefBuf::as_str),
                  Some("http://www.idpf.org/epub/linking/cfi/epub-cfi.html")
                ),
                "cannot handle non-epub fragment selector"
              );
              fragment.value
            }
            selector => bail!("cannot handle annotation selector: {selector:#?}"),
          }
        }
        raw::Target::Iri(_) | raw::Target::ExternalWebResource(_) => todo!(),
      };

      let body = if let Some(body_value) = raw_annot.body_value {
        Some(body_value)
      } else if let Some(raw_bodies) = raw_annot.body {
        let mut raw_bodies = raw_bodies.into_vec();
        ensure!(
          raw_bodies.len() == 1,
          "cannot handle multiple annotation bodies"
        );
        let raw_body = raw_bodies.remove(0);
        match raw_body {
          raw::Body::TextualBody(raw_body) => Some(raw_body.value),
          _ => todo!(),
        }
      } else {
        None
      };

      Ok(Annotation { selector, body })
    })
    .collect()
}

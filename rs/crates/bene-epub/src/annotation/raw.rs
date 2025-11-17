#![allow(dead_code)]

use anyhow::Result;
use format_serde_error::SerdeError;
use iref::IriRefBuf;
use mediatype::MediaTypeBuf;
use serde::Deserialize;
use smallvec::{smallvec, SmallVec};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Variable<T> {
  One(T),
  Many(SmallVec<[T; 2]>),
}

pub trait IntoVec {
  type T;

  fn into_vec(self) -> SmallVec<[Self::T; 2]>;
}

impl<T> IntoVec for Variable<T> {
  type T = T;

  fn into_vec(self) -> SmallVec<[T; 2]> {
    match self {
      Variable::One(t) => smallvec![t],
      Variable::Many(ts) => ts,
    }
  }
}

impl<T> IntoVec for Option<Variable<T>> {
  type T = T;
  fn into_vec(self) -> SmallVec<[Self::T; 2]> {
    match self {
      None => SmallVec::new(),
      Some(t) => t.into_vec(),
    }
  }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
  #[serde(rename = "@context")]
  pub context: String,

  pub id: String,

  pub r#type: String,

  pub body: Option<Variable<Body>>,

  pub body_value: Option<String>,

  pub target: Variable<Target>,
}

impl Annotation {
  pub fn parse(s: &str) -> Result<Self> {
    serde_json::from_str(s).map_err(|err| SerdeError::new(s.to_string(), err).into())
  }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFields {
  pub format: Option<MediaTypeBuf>,

  pub language: Option<Variable<String>>,

  pub processing_language: Option<String>,

  pub text_direction: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Body {
  Iri(IriRefBuf),
  TextualBody(TextualBody),
  SpecificResource(SpecificResource),
  Choice(Choice),
  ExternalWebResource(ExternalWebResource),
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpecificResource {
  pub id: Option<String>,

  pub r#type: Option<String>,

  pub source: Box<Target>,

  pub purpose: Option<String>,

  pub selector: Option<Variable<Selector>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Choice {
  pub r#type: String,

  pub items: Vec<Body>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TextualBody {
  pub id: Option<String>,

  pub r#type: Option<String>,

  pub value: String,

  #[serde(flatten)]
  pub fields: ResourceFields,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Target {
  Iri(IriRefBuf),
  SpecificResource(SpecificResource),
  ExternalWebResource(ExternalWebResource),
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExternalWebResource {
  pub id: String,

  #[serde(flatten)]
  pub fields: ResourceFields,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Selector {
  Iri(IriRefBuf),
  TaggedSelector(TaggedSelector),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
#[allow(clippy::enum_variant_names)]
pub enum TaggedSelector {
  FragmentSelector(FragmentSelector),
  CssSelector(CssSelector),
  XPathSelector(XPathSelector),
  TextQuoteSelector(TextQuoteSelector),
  TextPositionSelector(TextPositionSelector),
  DataPositionSelector(DataPositionSelector),
  SvgSelector(SvgSelector),
  RangeSelector(RangeSelector),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragmentSelector {
  pub value: String,
  pub conforms_to: Option<IriRefBuf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CssSelector {
  pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct XPathSelector {
  pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TextQuoteSelector {
  pub exact: String,
  pub prefix: Option<String>,
  pub suffix: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TextPositionSelector {
  pub start: u64,
  pub end: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DataPositionSelector {
  pub start: u64,
  pub end: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SvgSelector {
  pub id: Option<IriRefBuf>,
  pub value: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeSelector {
  pub start_selector: Box<Selector>,
  pub end_selector: Box<Selector>,
}

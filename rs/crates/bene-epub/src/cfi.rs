use anyhow::anyhow;
use nom::{
  IResult, Parser,
  branch::alt,
  bytes::complete::tag,
  character::complete::{char, none_of, one_of},
  combinator::{opt, recognize},
  error::ErrorKind,
  multi::{count, many1},
  sequence::{delimited, preceded},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

trait Parse: Sized {
  fn nom(i: &str) -> IResult<&str, Self>;
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
pub struct Fragment {
  pub path: Path,
  pub range: Option<Range>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
pub struct Range {
  pub from: Path,
  pub to: Path,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
pub struct Path {
  pub components: Vec<PathComponent>,
  pub offset: Option<Offset>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(tag = "type", content = "value")]
#[ts(export)]
pub enum PathComponent {
  Step(u32),
  Assertion(Assertion),
  Indirection,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(tag = "type", content = "value")]
#[ts(export)]
pub enum Assertion {
  Id(String),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(tag = "type", content = "value")]
#[ts(export)]
pub enum Offset {
  Character(u32),
}

impl Fragment {
  pub fn parse(i: &str) -> anyhow::Result<Self> {
    let (_, fragment) = Fragment::nom(i).map_err(|e| anyhow!("{e}"))?;
    Ok(fragment)
  }
}

impl Parse for Fragment {
  fn nom(i: &str) -> IResult<&str, Self> {
    let (i, (path, range)) =
      delimited(tag("epubcfi("), Path::nom.and(opt(Range::nom)), char(')')).parse(i)?;
    Ok((i, Fragment { path, range }))
  }
}

impl Parse for Range {
  fn nom(i: &str) -> IResult<&str, Self> {
    let (i, mut paths) = count(preceded(char(','), Path::nom), 2).parse(i)?;
    let to = paths.remove(1);
    let from = paths.remove(0);
    let range = Range { from, to };
    Ok((i, range))
  }
}

impl Parse for Path {
  fn nom(i: &str) -> IResult<&str, Self> {
    let (i, (components, offset)) = many1(PathComponent::nom).and(opt(Offset::nom)).parse(i)?;
    Ok((i, Path { components, offset }))
  }
}

impl Parse for PathComponent {
  fn nom(i: &str) -> IResult<&str, Self> {
    alt((
      preceded(char('/'), integer).map(PathComponent::Step),
      char('!').map(|_| PathComponent::Indirection),
      Assertion::nom.map(PathComponent::Assertion),
    ))
    .parse(i)
  }
}

fn integer(i: &str) -> IResult<&str, u32> {
  let (i, s) = recognize(many1(one_of("0123456789"))).parse(i)?;
  let n = s
    .parse::<u32>()
    .map_err(|_| nom::Err::Error(nom::error::Error::new(i, ErrorKind::AlphaNumeric)))?;
  Ok((i, n))
}

fn string(i: &str) -> IResult<&str, String> {
  let (i, s) = recognize(many1(none_of("^[](),;="))).parse(i)?;
  Ok((i, s.to_string()))
}

impl Parse for Assertion {
  fn nom(i: &str) -> IResult<&str, Self> {
    delimited(char('['), alt((string.map(Assertion::Id),)), char(']')).parse(i)
  }
}

impl Parse for Offset {
  fn nom(i: &str) -> IResult<&str, Self> {
    alt((preceded(char(':'), integer).map(Offset::Character),)).parse(i)
  }
}

#[cfg(test)]
mod test {
  use super::*;

  #[test]
  fn test_cfi() {
    let cfi = "epubcfi(/6/2[pageref]!/4/2/2/8,/1:0,/1:15)";
    assert_eq!(
      Fragment::parse(cfi).unwrap(),
      Fragment {
        path: Path {
          components: vec![
            PathComponent::Step(6),
            PathComponent::Step(2),
            PathComponent::Assertion(Assertion::Id("pageref".into())),
            PathComponent::Indirection,
            PathComponent::Step(4),
            PathComponent::Step(2),
            PathComponent::Step(2),
            PathComponent::Step(8),
          ],
          offset: None
        },
        range: Some(Range {
          from: Path {
            components: vec![PathComponent::Step(1)],
            offset: Some(Offset::Character(0))
          },
          to: Path {
            components: vec![PathComponent::Step(1)],
            offset: Some(Offset::Character(15))
          }
        })
      }
    );
  }
}

use super::raw::*;

#[test]
fn test_example_1_simple_annotation() {
  let json = r#"{
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "http://example.org/anno1",
      "type": "Annotation",
      "body": "http://example.org/post1",
      "target": "http://example.com/page1"
  }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno1");
  println!("{annotation:#?}");
}

#[test]
fn test_example_2_external_web_resources() {
  let json = r#"{
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "http://example.org/anno2",
      "type": "Annotation",
      "body": {
          "id": "http://example.org/analysis1.mp3",
          "format": "audio/mpeg",
          "language": "fr"
      },
      "target": {
          "id": "http://example.gov/patent1.pdf",
          "format": "application/pdf",
          "language": ["en", "ar"],
          "textDirection": "ltr",
          "processingLanguage": "en"
      }
  }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno2");
  println!("{annotation:#?}");
}

#[test]
fn test_example_3_resource_classes() {
  let json = r#"{
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "http://example.org/anno3",
      "type": "Annotation",
      "body": {
          "id": "http://example.org/video1",
          "type": "Video"
      },
      "target": {
          "id": "http://example.org/website1",
          "type": "Text"
      }
  }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno3");
  println!("{annotation:#?}");
}

#[test]
fn test_example_4_fragment_selector() {
  let json = r#"{
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "http://example.org/anno4",
      "type": "Annotation",
      "body": "http://example.org/description1",
      "target": {
          "id": "http://example.com/image1#xywh=100,100,300,300",
          "type": "Image",
          "format": "image/jpeg"
      }
  }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno4");
}

#[test]
fn test_example_5_embedded_textual_body() {
  let json = r#"{
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "id": "http://example.org/anno5",
      "type": "Annotation",
      "body": {
          "type": "TextualBody",
          "value": "<p>j'adore !</p>",
          "format": "text/html",
          "language": "fr"
      },
      "target": "http://example.org/photo1"
  }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno5");
}

#[test]
fn test_example_6_body_value() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno6",
            "type": "Annotation",
            "bodyValue": "Comment text",
            "target": "http://example.org/target1"
        }"#;

  // This example uses bodyValue which we haven't implemented yet
  // It should still parse but bodyValue will be ignored
  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno6");
}

#[test]
fn test_example_7_textual_body_equivalent() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno7",
            "type": "Annotation",
            "body": {
                "type": "TextualBody",
                "value": "Comment text",
                "format": "text/plain"
            },
            "target": "http://example.org/target1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno7");
}

#[test]
fn test_example_8_no_body() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno8",
            "type": "Annotation",
            "target": "http://example.org/ebook1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno8");
  assert!(annotation.body.is_none());
}

#[test]
fn test_example_9_multiple_bodies_targets() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno9",
            "type": "Annotation",
            "body": [
                "http://example.org/description1",
                {
                    "type": "TextualBody",
                    "value": "tag1"
                }
            ],
            "target": [
                "http://example.org/image1",
                "http://example.org/image2"
            ]
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno9");
}

#[test]
fn test_example_10_choice() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno10",
            "type": "Annotation",
            "body": {
                "type": "Choice",
                "items": [
                    {
                        "id": "http://example.org/note1",
                        "language": "en"
                    },
                    {
                        "id": "http://example.org/note2",
                        "language": "fr"
                    }
                ]
            },
            "target": "http://example.org/website1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno10");
}

#[test]
fn test_example_11_agents_and_timestamps() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno11",
            "type": "Annotation",
            "creator": "http://example.org/user1",
            "created": "2015-01-28T12:00:00Z",
            "modified": "2015-01-29T09:00:00Z",
            "generator": "http://example.org/client1",
            "generated": "2015-02-04T12:00:00Z",
            "body": {
                "id": "http://example.net/review1",
                "creator": "http://example.net/user2",
                "created": "2014-06-02T17:00:00Z"
            },
            "target": "http://example.com/restaurant1"
        }"#;

  let _annotation = Annotation::parse(json).unwrap();
}

#[test]
fn test_example_12_agent_details() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno12",
            "type": "Annotation",
            "creator": {
                "id": "http://example.org/user1",
                "type": "Person",
                "name": "My Pseudonym",
                "nickname": "pseudo",
                "email_sha1": "58bad08927902ff9307b621c54716dcc5083e339"
            },
            "generator": {
                "id": "http://example.org/client1",
                "type": "Software",
                "name": "Code v2.1",
                "homepage": "http://example.org/client1/homepage1"
            },
            "body": "http://example.net/review1",
            "target": "http://example.com/restaurant1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno12");
}

#[test]
fn test_example_13_audience() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno13",
            "type": "Annotation",
            "audience": {
                "id": "http://example.edu/roles/teacher",
                "type": "schema:EducationalAudience",
                "schema:educationalRole": "teacher"
            },
            "body": "http://example.net/classnotes1",
            "target": "http://example.com/textbook1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno13");
}

#[test]
fn test_example_14_accessibility() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno14",
            "type": "Annotation",
            "motivation": "commenting",
            "body": "http://example.net/comment1",
            "target": {
                "id": "http://example.com/video1",
                "type": "Video",
                "accessibility": "captions"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno14");
}

#[test]
fn test_example_15_motivation_and_purpose() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno15",
            "type": "Annotation",
            "motivation": "bookmarking",
            "body": [
                {
                    "type": "TextualBody",
                    "value": "readme",
                    "purpose": "tagging"
                },
                {
                    "type": "TextualBody",
                    "value": "A good description of the topic that bears further investigation",
                    "purpose": "describing"
                }
            ],
            "target": "http://example.com/page1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno15");
}

#[test]
fn test_example_16_rights() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno16",
            "type": "Annotation",
            "rights": "https://creativecommons.org/publicdomain/zero/1.0/",
            "body": {
                "id": "http://example.net/review1",
                "rights": "http://creativecommons.org/licenses/by-nc/4.0/"
            },
            "target": "http://example.com/product1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno16");
}

#[test]
fn test_example_17_canonical_and_via() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno17",
            "type": "Annotation",
            "canonical": "urn:uuid:dbfb1861-0ecf-41ad-be94-a584e5c4f1df",
            "via": "http://other.example.org/anno1",
            "body": {
                "id": "http://example.net/review1",
                "rights": "http://creativecommons.org/licenses/by/4.0/"
            },
            "target": "http://example.com/product1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno17");
}

#[test]
fn test_example_18_specific_resource_purpose() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno18",
            "type": "Annotation",
            "body": {
                "type": "SpecificResource",
                "purpose": "tagging",
                "source": "http://example.org/city1"
            },
            "target": {
                "id": "http://example.org/photo1",
                "type": "Image"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno18");
}

#[test]
fn test_example_19_selectors() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno19",
            "type": "Annotation",
            "body": {
                "source": "http://example.org/page1",
                "selector": "http://example.org/paraselector1"
            },
            "target": {
                "source": "http://example.com/dataset1",
                "selector": "http://example.org/dataselector1"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno19");
}

#[test]
fn test_example_20_fragment_selector_detailed() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno20",
            "type": "Annotation",
            "body": {
                "source": "http://example.org/video1",
                "purpose": "describing",
                "selector": {
                    "type": "FragmentSelector",
                    "conformsTo": "http://www.w3.org/TR/media-frags/",
                    "value": "t=30,60"
                }
            },
            "target": "http://example.org/image1"
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno20");
}

#[test]
fn test_example_21_css_selector() {
  let json = r##"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno21",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/page1.html",
                "selector": {
                    "type": "CssSelector",
                    "value": "#elemid > .elemclass + p"
                }
            }
        }"##;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno21");
}

#[test]
fn test_example_22_xpath_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno22",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/page1.html",
                "selector": {
                    "type": "XPathSelector",
                    "value": "/html/body/p[2]/table/tr[2]/td[3]/span"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno22");
}

#[test]
fn test_example_23_text_quote_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno23",
            "type": "Annotation",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.org/page1",
                "selector": {
                    "type": "TextQuoteSelector",
                    "exact": "anotation",
                    "prefix": "this is an ",
                    "suffix": " that has some"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno23");
}

#[test]
fn test_example_24_text_position_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno24",
            "type": "Annotation",
            "body": "http://example.org/review1",
            "target": {
                "source": "http://example.org/ebook1",
                "selector": {
                    "type": "TextPositionSelector",
                    "start": 412,
                    "end": 795
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno24");
}

#[test]
fn test_example_25_data_position_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno25",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/diskimg1",
                "selector": {
                    "type": "DataPositionSelector",
                    "start": 4096,
                    "end": 4104
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno25");
}

#[test]
fn test_example_26_svg_selector_external() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno26",
            "type": "Annotation",
            "body": "http://example.org/road1",
            "target": {
                "source": "http://example.org/map1",
                "selector": {
                    "id": "http://example.org/svg1",
                    "type": "SvgSelector"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno26");
}

#[test]
fn test_example_27_svg_selector_embedded() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno27",
            "type": "Annotation",
            "body": "http://example.org/road1",
            "target": {
                "source": "http://example.org/map1",
                "selector": {
                    "type": "SvgSelector",
                    "value": "<svg:svg> ... </svg:svg>"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno27");
}

#[test]
fn test_example_28_range_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno28",
            "type": "Annotation",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.org/page1.html",
                "selector": {
                    "type": "RangeSelector",
                    "startSelector": {
                        "type": "XPathSelector",
                        "value": "//table[1]/tr[1]/td[2]"
                    },
                    "endSelector": {
                        "type": "XPathSelector",
                        "value": "//table[1]/tr[1]/td[4]"
                    }
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno28");
}

#[test]
fn test_example_29_refined_selector() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno29",
            "type": "Annotation",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.org/page1",
                "selector": {
                    "type": "FragmentSelector",
                    "value": "para5",
                    "refinedBy": {
                        "type": "TextQuoteSelector",
                        "exact": "Selected Text",
                        "prefix": "text before the ",
                        "suffix": " and text after it"
                    }
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno29");
}

#[test]
fn test_example_30_state() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno30",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/page1",
                "state": {
                    "id": "http://example.org/state1"
                }
            }
        }"#;

  Annotation::parse(json).unwrap();
}

#[test]
fn test_example_31_time_state() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno31",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/page1",
                "state": {
                    "type": "TimeState",
                    "cached": "http://archive.example.org/copy1",
                    "sourceDate": "2015-07-20T13:30:00Z"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno31");
}

#[test]
fn test_example_32_http_request_state() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno32",
            "type": "Annotation",
            "body": "http://example.org/description1",
            "target": {
                "source": "http://example.org/resource1",
                "state": {
                    "type": "HttpRequestState",
                    "value": "Accept: application/pdf"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno32");
}

#[test]
fn test_example_33_refined_state() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno33",
            "type": "Annotation",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.org/ebook1",
                "state": {
                    "type": "TimeState",
                    "sourceDate": "2016-02-01T12:05:23Z",
                    "refinedBy": {
                        "type": "HttpRequestState",
                        "value": "Accept: application/pdf",
                        "refinedBy": {
                            "type": "FragmentSelector",
                            "value": "page=10",
                            "conformsTo": "http://tools.ietf.org/rfc/rfc3778"
                        }
                    }
                }
            }
        }"#;

  let _annotation = Annotation::parse(json).unwrap();
}

#[test]
fn test_example_34_stylesheet_external() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno34",
            "type": "Annotation",
            "stylesheet": "http://example.org/style1",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.org/document1",
                "styleClass": "red"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno34");
}

#[test]
fn test_example_35_stylesheet_embedded() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno35",
            "type": "Annotation",
            "stylesheet": {
                "type": "CssStylesheet",
                "value": ".red { color: red }"
            },
            "body": "http://example.org/body1",
            "target": {
                "source": "http://example.org/target1",
                "styleClass": "red"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno35");
}

#[test]
fn test_example_36_rendered_via() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno36",
            "type": "Annotation",
            "body": "http://example.org/comment1",
            "target": {
                "source": "http://example.edu/article.pdf",
                "selector": "http://example.org/selectors/html-selector1",
                "renderedVia": {
                    "id": "http://example.com/pdf-to-html-library",
                    "type": "Software",
                    "schema:softwareVersion": "2.5"
                }
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno36");
}

#[test]
fn test_example_37_scope() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno37",
            "type": "Annotation",
            "body": "http://example.org/note1",
            "target": {
                "source": "http://example.org/image1",
                "scope": "http://example.org/page1"
            }
        }"#;

  let annotation = Annotation::parse(json).unwrap();
  assert_eq!(annotation.id.as_str(), "http://example.org/anno37");
}

#[test]
fn test_example_38_complex_annotation() {
  let json = r#"{
            "@context": "http://www.w3.org/ns/anno.jsonld",
            "id": "http://example.org/anno38",
            "type": "Annotation",
            "motivation": "commenting",
            "creator": {
                "id": "http://example.org/user1",
                "type": "Person",
                "name": "A. Person",
                "nickname": "user1"
            },
            "created": "2015-10-13T13:00:00Z",
            "generator": {
                "id": "http://example.org/client1",
                "type": "Software",
                "name": "Code v2.1",
                "homepage": "http://example.org/homepage1"
            },
            "generated": "2015-10-14T15:13:28Z",
            "stylesheet": {
                "id": "http://example.org/stylesheet1",
                "type": "CssStylesheet"
            },
            "body": [
                {
                    "type": "TextualBody",
                    "purpose": "tagging",
                    "value": "love"
                },
                {
                    "type": "Choice",
                    "items": [
                        {
                            "type": "TextualBody",
                            "purpose": "describing",
                            "value": "I really love this particular bit of text in this XML. No really.",
                            "format": "text/plain",
                            "language": "en",
                            "creator": "http://example.org/user1"
                        },
                        {
                            "type": "SpecificResource",
                            "purpose": "describing",
                            "source": {
                                "id": "http://example.org/comment1",
                                "type": "Audio",
                                "format": "audio/mpeg",
                                "language": "de",
                                "creator": {
                                    "id": "http://example.org/user2",
                                    "type": "Person"
                                }
                            }
                        }
                    ]
                }
            ],
            "target": {
                "type": "SpecificResource",
                "styleClass": "mystyle",
                "source": "http://example.com/document1",
                "state": [
                    {
                        "type": "HttpRequestState",
                        "value": "Accept: application/xml",
                        "refinedBy": {
                            "type": "TimeState",
                            "sourceDate": "2015-09-25T12:00:00Z"
                        }
                    }
                ],
                "selector": {
                    "type": "FragmentSelector",
                    "value": "xpointer(/doc/body/section[2]/para[1])",
                    "refinedBy": {
                        "type": "TextPositionSelector",
                        "start": 6,
                        "end": 27
                    }
                }
            }
        }"#;

  let _annotation = Annotation::parse(json).unwrap();
}

#[test]
fn test_portable_epub() {
  let json = r#"{
    "@context": "http://www.w3.org/ns/anno.jsonld",
    "id": "anno0",
    "type": "Annotation",
    "target": {
      "source": "index.xhtml",
      "selector": {
        "type": "FragmentSelector",
        "conformsTo": "http://www.idpf.org/epub/linking/cfi/epub-cfi.html",
        "value": "epubcfi(/6/2[page]!/4/2/2/8/,/1:0,/1:10)"
      }
    }
  }"#;
  let _annotation = Annotation::parse(json).unwrap();
}

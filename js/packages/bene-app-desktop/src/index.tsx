// import { invoke } from "@tauri-apps/api/tauri";
import {
  Component,
  Resource,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { render } from "solid-js/web";

import { Rendition, commands } from "./bindings";

type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };
type Epub = { renditions: Rendition[] };

interface FallibleResourceProps<T> {
  resource: Resource<Result<T, string>>;
  view: Component<{ data: T }>;
}

function FalliblePromise<T>(props: FallibleResourceProps<T>) {
  return (
    <div>
      {props.resource.loading ? (
        <>Loading...</>
      ) : (
        (() => {
          let resource = props.resource()!;
          return resource.status == "error" ? (
            <pre>{resource.error}</pre>
          ) : (
            <props.view data={resource.data} />
          );
        })()
      )}
    </div>
  );
}

function ChapterView({ data }: { data: string }) {
  return <div innerHTML={data} />;
}

function EpubView({ data }: { data: Epub }) {
  let [renditionIndex] = createSignal(0);
  let rendition = () => data.renditions[renditionIndex()];

  let [chapterIndex, setChapterIndex] = createSignal(0);
  let chapterId = () =>
    rendition().package.spine.itemref![chapterIndex()]["@idref"];

  let [chapterResource] = createResource(
    async () => await commands.chapter(renditionIndex(), chapterId())
  );
  return <FalliblePromise resource={chapterResource} view={ChapterView} />;
}

function App() {
  let [epubResource] = createResource(async () => await commands.epub());
  return <FalliblePromise resource={epubResource} view={EpubView} />;
}

render(() => <App />, document.getElementById("root")!);

import { test } from "rs-utils";

document.addEventListener("dragover", event => {
  event.stopPropagation();
  event.preventDefault();
  event.dataTransfer!.dropEffect = "copy";
});

document.addEventListener("drop", event => {
  event.stopPropagation();
  event.preventDefault();

  const files = event.dataTransfer?.files;
  if (files?.length && files.length > 0) {
    const file = files[0];
    const reader = new FileReader();

    reader.onload = e => {
      if (!e.target) return;
      const arrayBuffer = e.target.result as ArrayBuffer;
      const byteArray = new Uint8Array(arrayBuffer);
      
      // TODO: PICK UP FROM HERE
      test(byteArray);
    };

    reader.readAsArrayBuffer(file);
  }
});
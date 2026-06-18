import * as htmlToImage from "html-to-image";

export async function exportCanvasElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await htmlToImage.toPng(el, { pixelRatio: 2 });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

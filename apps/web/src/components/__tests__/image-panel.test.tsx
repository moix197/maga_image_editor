import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImagePanel } from "@/components/image-panel";

function makeFile(name: string, type: string, sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const TEST_DATA_URL = "data:image/png;base64,abc";

describe("ImagePanel", () => {
  let onFile: (file: File) => void;
  let onError: (msg: string) => void;

  beforeEach(() => {
    onFile = vi.fn<(file: File) => void>();
    onError = vi.fn<(msg: string) => void>();
  });

  it("shows ImageUploader (drop zone) when dataUrl is null", () => {
    render(<ImagePanel label="Source" dataUrl={null} onFile={onFile} onError={onError} />);
    expect(screen.getByRole("button", { name: /upload image/i })).toBeInTheDocument();
  });

  it("shows img when dataUrl is set", () => {
    render(<ImagePanel label="Source" dataUrl={TEST_DATA_URL} onFile={onFile} onError={onError} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("download button absent when onDownload not provided and dataUrl set", () => {
    render(<ImagePanel label="Source" dataUrl={TEST_DATA_URL} onFile={onFile} onError={onError} />);
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("download button present when onDownload provided and dataUrl set", () => {
    const onDownload = vi.fn();
    render(
      <ImagePanel label="Source" dataUrl={TEST_DATA_URL} onFile={onFile} onError={onError} onDownload={onDownload} />
    );
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });

  it("onFile is called when valid file selected via input", () => {
    render(<ImagePanel label="Source" dataUrl={null} onFile={onFile} onError={onError} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = makeFile("photo.png", "image/png");
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
});

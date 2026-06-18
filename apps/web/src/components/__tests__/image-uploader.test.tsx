import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageUploader } from "@/components/image-uploader";

function makeFile(name: string, type: string, sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("ImageUploader", () => {
  let onFile: (file: File) => void;
  let onError: (msg: string) => void;

  beforeEach(() => {
    onFile = vi.fn<(file: File) => void>();
    onError = vi.fn<(msg: string) => void>();
  });

  it("renders drop zone text", () => {
    render(<ImageUploader onFile={onFile} onError={onError} />);
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument();
  });

  it("calls onFile when valid file is dropped", () => {
    render(<ImageUploader onFile={onFile} onError={onError} />);
    const zone = screen.getByRole("button");
    const file = makeFile("photo.jpg", "image/jpeg");

    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError when invalid type is dropped", () => {
    render(<ImageUploader onFile={onFile} onError={onError} />);
    const zone = screen.getByRole("button");
    const file = makeFile("doc.txt", "text/plain");

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/unsupported/i));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("calls onError when file is too large", () => {
    render(<ImageUploader onFile={onFile} onError={onError} />);
    const zone = screen.getByRole("button");
    const file = makeFile("big.jpg", "image/jpeg", 21 * 1024 * 1024);

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("calls onFile when valid file selected via input", () => {
    render(<ImageUploader onFile={onFile} onError={onError} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = makeFile("photo.png", "image/png");

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });
});

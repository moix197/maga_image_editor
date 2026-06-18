"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { validateImageFile } from "@/lib/image-helpers";

interface ImageUploaderProps {
  onFile: (file: File) => void;
  onError: (msg: string) => void;
}

export function ImageUploader({ onFile, onError }: ImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function processFile(file: File) {
    const result = validateImageFile(file);
    if (!result.valid) {
      onError(result.error!);
      return;
    }
    onFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload image by clicking or dragging a file here"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors duration-200 min-h-[240px] ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border bg-muted/50 hover:border-primary/50 hover:bg-muted"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Drop an image here or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP, GIF — up to 20 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

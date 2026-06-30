const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Some OSes report JPG as the non-standard "image/jpg" instead of "image/jpeg".
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!ALLOWED_TYPES.includes(type)) {
    return { valid: false, error: `Unsupported file type "${file.type}". Use JPEG, PNG, WebP, GIF, or SVG.` };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.` };
  }
  return { valid: true };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function downscaleIfNeeded(dataUrl: string, maxDimension = 2048): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        resolve(dataUrl);
        return;
      }
      const scale = maxDimension / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL());
    };
    img.onerror = () => reject(new Error("Failed to load image for downscaling"));
    img.src = dataUrl;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

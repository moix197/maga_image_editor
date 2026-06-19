import { describe, it, expect } from "vitest";
import { dataUrlToBlob } from "../src/zip-export";

// 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

describe("dataUrlToBlob", () => {
  it("round-trips a PNG data URL to correct MIME type and byte length", async () => {
    const blob = dataUrlToBlob(PNG_DATA_URL);
    const expectedBytes = atob(PNG_BASE64).length;

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(expectedBytes);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    // PNG magic number.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

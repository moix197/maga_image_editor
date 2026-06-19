export function isCartoonizeEnabled(): boolean {
  return !!process.env.DEEPAI_API_KEY;
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeType = header.replace("data:", "").replace(";base64", "");
  const buffer = Buffer.from(base64, "base64");
  return { buffer, mimeType };
}

export async function cartoonizeBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(buffer)], { type: mimeType }), "image");

  const response = await fetch("https://api.deepai.org/api/toonify", {
    method: "POST",
    headers: { "api-key": process.env.DEEPAI_API_KEY! },
    body: formData,
  });

  if (response.status === 429) {
    throw new Error("DeepAI rate limit exceeded. Try again later.");
  }
  if (response.status === 402 || response.status === 403) {
    throw new Error("DeepAI quota exceeded. Check your dashboard.");
  }
  if (!response.ok) {
    throw new Error(`DeepAI request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.output_url) {
    throw new Error("DeepAI response missing output_url");
  }
  return data.output_url as string;
}

export async function fetchOutputAsDataUrl(outputUrl: string): Promise<string> {
  const response = await fetch(outputUrl);
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

export async function cartoonizeDataUrl(dataUrl: string): Promise<string> {
  const { buffer, mimeType } = dataUrlToBuffer(dataUrl);
  const outputUrl = await cartoonizeBuffer(buffer, mimeType);
  return fetchOutputAsDataUrl(outputUrl);
}

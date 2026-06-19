import { NextResponse } from "next/server";
import { isCartoonizeEnabled, cartoonizeDataUrl } from "@/lib/cartoonize-service";

const SIZE_LIMIT = 14_000_000;

export async function GET() {
  return NextResponse.json({ enabled: isCartoonizeEnabled() });
}

export async function POST(request: Request) {
  let body: { imageDataUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { imageDataUrl } = body ?? {};

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }
  if (!imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
  }
  if (imageDataUrl.length > SIZE_LIMIT) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  if (!isCartoonizeEnabled()) {
    return NextResponse.json(
      { disabled: true, error: "Cartoonize is disabled: DEEPAI_API_KEY is not set" },
      { status: 503 }
    );
  }

  try {
    const outputUrl = await cartoonizeDataUrl(imageDataUrl);
    return NextResponse.json({ outputUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cartoonize failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

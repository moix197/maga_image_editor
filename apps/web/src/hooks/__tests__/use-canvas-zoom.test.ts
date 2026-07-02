import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasZoom, MIN_ZOOM, MAX_ZOOM } from "../use-canvas-zoom";

function makeContainer(clientWidth: number, clientHeight: number, padding = 0): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  if (padding) {
    el.style.paddingLeft = `${padding}px`;
    el.style.paddingRight = `${padding}px`;
    el.style.paddingTop = `${padding}px`;
    el.style.paddingBottom = `${padding}px`;
  }
  return el;
}

function makeImage(naturalWidth: number, naturalHeight: number): HTMLImageElement {
  return { naturalWidth, naturalHeight } as unknown as HTMLImageElement;
}

describe("useCanvasZoom – zoomIn/zoomOut step + clamp", () => {
  it("defaults to zoom=1 (100%)", () => {
    const { result } = renderHook(() => useCanvasZoom());
    expect(result.current.zoom).toBe(1);
  });

  it("zoomIn increases by 25% steps", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(1.25);
  });

  it("zoomOut decreases by 25% steps", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBe(0.75);
  });

  it("clamps zoomIn at MAX_ZOOM (400%)", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => {
      for (let i = 0; i < 20; i++) result.current.zoomIn();
    });
    expect(result.current.zoom).toBe(MAX_ZOOM);
  });

  it("clamps zoomOut at MIN_ZOOM (25%)", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => {
      for (let i = 0; i < 20; i++) result.current.zoomOut();
    });
    expect(result.current.zoom).toBe(MIN_ZOOM);
  });
});

describe("useCanvasZoom – resetZoom", () => {
  it("resets zoom to 1 (100%) after zooming in", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    act(() => result.current.resetZoom());
    expect(result.current.zoom).toBe(1);
  });

  it("resets zoom to 1 (100%) after zooming out", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.zoomOut());
    act(() => result.current.resetZoom());
    expect(result.current.zoom).toBe(1);
  });
});

describe("useCanvasZoom – fitToViewport", () => {
  it("computes min(containerW/naturalW, containerH/naturalH) when width is the limiting axis", () => {
    const { result } = renderHook(() => useCanvasZoom());
    // container 500x1000, image 1000x1000 -> width ratio 0.5, height ratio 1 -> min 0.5
    act(() => result.current.fitToViewport(makeContainer(500, 1000), makeImage(1000, 1000)));
    expect(result.current.zoom).toBe(0.5);
  });

  it("computes min(containerW/naturalW, containerH/naturalH) when height is the limiting axis", () => {
    const { result } = renderHook(() => useCanvasZoom());
    // container 1000x300, image 1000x1000 -> width ratio 1, height ratio 0.3 -> min 0.3
    act(() => result.current.fitToViewport(makeContainer(1000, 300), makeImage(1000, 1000)));
    expect(result.current.zoom).toBeCloseTo(0.3);
  });

  it("subtracts container padding from the available content box", () => {
    const { result } = renderHook(() => useCanvasZoom());
    // container 500x1000 with 16px padding each side, image 1000x1000
    // -> avail 468x968 -> width ratio 0.468, height 0.968 -> min 0.468
    act(() => result.current.fitToViewport(makeContainer(500, 1000, 16), makeImage(1000, 1000)));
    expect(result.current.zoom).toBeCloseTo(0.468);
  });

  it("clamps the fit ratio to MAX_ZOOM when the container is much larger than the image", () => {
    const { result } = renderHook(() => useCanvasZoom());
    // container 5000x5000, image 100x100 -> ratio 50 -> clamped to MAX_ZOOM
    act(() => result.current.fitToViewport(makeContainer(5000, 5000), makeImage(100, 100)));
    expect(result.current.zoom).toBe(MAX_ZOOM);
  });

  it("clamps the fit ratio to MIN_ZOOM when the image is much larger than the container", () => {
    const { result } = renderHook(() => useCanvasZoom());
    // container 100x100, image 10000x10000 -> ratio 0.01 -> clamped to MIN_ZOOM
    act(() => result.current.fitToViewport(makeContainer(100, 100), makeImage(10000, 10000)));
    expect(result.current.zoom).toBe(MIN_ZOOM);
  });

  it("no-ops when containerEl is null", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.fitToViewport(null, makeImage(1000, 1000)));
    expect(result.current.zoom).toBe(1);
  });

  it("no-ops when imageEl is null", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.fitToViewport(makeContainer(500, 500), null));
    expect(result.current.zoom).toBe(1);
  });

  it("no-ops when the image's natural size is not yet available (0x0)", () => {
    const { result } = renderHook(() => useCanvasZoom());
    act(() => result.current.fitToViewport(makeContainer(500, 500), makeImage(0, 0)));
    expect(result.current.zoom).toBe(1);
  });
});

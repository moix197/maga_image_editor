import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProject } from "@/hooks/use-batch-project";

vi.mock("@/lib/image-helpers", () => ({
  fileToDataUrl: vi.fn((file: File) =>
    Promise.resolve("data:image/png;base64," + file.name)
  ),
}));

function makeFile(name: string): File {
  return new File([new Uint8Array(10)], name, { type: "image/png" });
}

describe("useBatchProject", () => {
  it("background starts null and overlays starts empty", () => {
    const { result } = renderHook(() => useBatchProject());
    expect(result.current.background).toBeNull();
    expect(result.current.overlays).toHaveLength(0);
  });

  it("setBackground sets the background asset", async () => {
    const { result } = renderHook(() => useBatchProject());
    const file = makeFile("bg.png");

    await act(async () => {
      await result.current.setBackground(file);
    });

    expect(result.current.background).not.toBeNull();
    expect(result.current.background!.filename).toBe("bg.png");
    expect(result.current.background!.blobKey).toBe("data:image/png;base64,bg.png");
  });

  it("addOverlays appends assets", async () => {
    const { result } = renderHook(() => useBatchProject());
    const files = [makeFile("a.png"), makeFile("b.png"), makeFile("c.png")];

    await act(async () => {
      await result.current.addOverlays(files);
    });

    expect(result.current.overlays).toHaveLength(3);
    expect(result.current.overlays.map((o) => o.filename)).toEqual([
      "a.png",
      "b.png",
      "c.png",
    ]);
  });

  it("duplicate filenames get different ids", async () => {
    const { result } = renderHook(() => useBatchProject());

    await act(async () => {
      await result.current.addOverlays([makeFile("dup.png"), makeFile("dup.png")]);
    });

    expect(result.current.overlays).toHaveLength(2);
    expect(result.current.overlays[0]!.id).not.toBe(result.current.overlays[1]!.id);
  });

  it("setEditorTemplate updates template without touching variableSlot", () => {
    const { result } = renderHook(() => useBatchProject());
    const editorState = { nodes: [{ id: "n1", type: "text" as const, x: 0, y: 0, zIndex: 0, text: "hi", fontSize: 14, fontFamily: "Arial", color: "#000", fontWeight: "normal" as const, fontStyle: "normal" as const, textDecoration: "none" as const, textAlign: "left" as const, opacity: 1 }] };

    act(() => {
      result.current.setEditorTemplate(editorState as never);
    });

    expect(result.current.template).toEqual(editorState);
    // variableSlot was never set, must remain null
    expect(result.current.variableSlot).toBeNull();
  });

  it("setEditorTemplate with undefined sets template to null", () => {
    const { result } = renderHook(() => useBatchProject());

    act(() => {
      result.current.setEditorTemplate(undefined);
    });

    expect(result.current.template).toBeNull();
  });
});

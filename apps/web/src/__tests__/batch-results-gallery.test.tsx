import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchResultsGallery } from "@/components/batch/BatchResultsGallery";
import { ResultsSection } from "@/components/batch/BatchWorkspace";
import type { GeneratedOutput, ProjectAsset } from "@maga/projects";
import type { useBatchRender } from "@/hooks/use-batch-render";

function makeOutput(id: string): GeneratedOutput {
  return { overlayAssetId: id, outputBlobKey: `data:image/png;base64,${id}`, timestamp: 0 };
}

function makeOverlay(id: string): ProjectAsset {
  return { id, filename: `${id}.png`, blobKey: `data:image/png;base64,overlay-${id}` };
}

const BASE_PROGRESS = { current: 0, total: 0 };

const STUB_BATCH_RENDER: ReturnType<typeof useBatchRender> = {
  isRunning: false,
  progress: BASE_PROGRESS,
  error: null,
  run: vi.fn(),
  cancel: vi.fn(),
};

describe("BatchResultsGallery", () => {
  it("renders one card per output", () => {
    const outputs = [makeOutput("a"), makeOutput("b"), makeOutput("c")];
    const overlays = outputs.map((o) => makeOverlay(o.overlayAssetId));
    render(
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={BASE_PROGRESS}
        isRunning={false}
      />
    );
    // Each card has a download button — three outputs → three download buttons
    expect(screen.getAllByRole("button", { name: /download/i })).toHaveLength(3);
  });

  it("calls onSelectOutput with correct overlayAssetId on click", async () => {
    const user = userEvent.setup();
    const outputs = [makeOutput("x"), makeOutput("y")];
    const overlays = outputs.map((o) => makeOverlay(o.overlayAssetId));
    const onSelectOutput = vi.fn();

    render(
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={BASE_PROGRESS}
        isRunning={false}
        selectedOutputId={null}
        onSelectOutput={onSelectOutput}
      />
    );

    const cards = screen.getAllByRole("button", { name: /composited/i });
    await user.click(cards[1]!);
    expect(onSelectOutput).toHaveBeenCalledWith("y");
  });

  it("selected card receives isSelected=true (aria-pressed=true)", () => {
    const outputs = [makeOutput("a"), makeOutput("b")];
    const overlays = outputs.map((o) => makeOverlay(o.overlayAssetId));

    render(
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={BASE_PROGRESS}
        isRunning={false}
        selectedOutputId="b"
        onSelectOutput={vi.fn()}
      />
    );

    const cards = screen.getAllByRole("button", { name: /composited/i });
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
    expect(cards[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("keyboard Enter fires onClick on a card", async () => {
    const user = userEvent.setup();
    const outputs = [makeOutput("k")];
    const overlays = [makeOverlay("k")];
    const onSelectOutput = vi.fn();

    render(
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={BASE_PROGRESS}
        isRunning={false}
        selectedOutputId={null}
        onSelectOutput={onSelectOutput}
      />
    );

    const card = screen.getByRole("button", { name: /composited/i });
    card.focus();
    await user.keyboard("{Enter}");
    expect(onSelectOutput).toHaveBeenCalledWith("k");
  });

  it("keyboard Space fires onClick on a card", async () => {
    const user = userEvent.setup();
    const outputs = [makeOutput("s")];
    const overlays = [makeOverlay("s")];
    const onSelectOutput = vi.fn();

    render(
      <BatchResultsGallery
        outputs={outputs}
        overlays={overlays}
        progress={BASE_PROGRESS}
        isRunning={false}
        selectedOutputId={null}
        onSelectOutput={onSelectOutput}
      />
    );

    const card = screen.getByRole("button", { name: /composited/i });
    card.focus();
    await user.keyboard(" ");
    expect(onSelectOutput).toHaveBeenCalledWith("s");
  });

  it("returns null when outputs is empty and not running", () => {
    const { container } = render(
      <BatchResultsGallery
        outputs={[]}
        overlays={[]}
        progress={BASE_PROGRESS}
        isRunning={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── ResultsSection: big-preview fallback via real component ──────────────────

function renderResultsSection(
  outputs: GeneratedOutput[],
  selectedOutputId: string | null,
  compositeDataUrl: string | null,
) {
  const overlays = outputs.map((o) => makeOverlay(o.overlayAssetId));
  return render(
    <ResultsSection
      outputs={outputs}
      overlays={overlays}
      batchRender={STUB_BATCH_RENDER}
      compositeDataUrl={compositeDataUrl}
      selectedOutputId={selectedOutputId}
      onSelectOutput={vi.fn()}
    />,
  );
}

describe("ResultsSection: previewDataUrl fallback (real component)", () => {
  it("shows the selected output's url when found", () => {
    const outputs = [makeOutput("a"), makeOutput("b")];
    renderResultsSection(outputs, "b", "data:composite");

    const preview = screen.getByAltText("Composite preview");
    expect(preview).toHaveAttribute("src", `data:image/png;base64,b`);
  });

  it("falls back to outputs[0] when selectedOutputId is stale (not in outputs)", () => {
    const outputs = [makeOutput("a"), makeOutput("b")];
    renderResultsSection(outputs, "stale-id", "data:composite");

    const preview = screen.getByAltText("Composite preview");
    expect(preview).toHaveAttribute("src", `data:image/png;base64,a`);
  });

  it("falls back to compositeDataUrl when outputs is empty and selectedOutputId is null", () => {
    renderResultsSection([], null, "data:composite");

    const preview = screen.getByAltText("Composite preview");
    expect(preview).toHaveAttribute("src", "data:composite");
  });

  it("falls back to compositeDataUrl when outputs is cleared with a stale selectedOutputId", () => {
    renderResultsSection([], "stale-id", "data:composite");

    const preview = screen.getByAltText("Composite preview");
    expect(preview).toHaveAttribute("src", "data:composite");
  });

  it("renders no preview img when outputs is empty and compositeDataUrl is null", () => {
    renderResultsSection([], null, null);

    expect(screen.queryByAltText("Composite preview")).toBeNull();
  });
});

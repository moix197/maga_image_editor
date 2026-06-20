import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkTextPanel } from "@/components/batch/BulkTextPanel";
import type { TextNode, NodeId } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";

// ── fixtures ────────────────────────────────────────────────────────────────

function makeOverlay(id: string, filename = `${id}.png`): ProjectAsset {
  return { id, filename, blobKey: `data:image/png;base64,${id}` };
}

function makeTextNode(id: string, content = `Text ${id}`): TextNode {
  return {
    id: id as NodeId,
    content,
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    fontSize: 16,
    color: "#000000",
    opacity: 1,
    fontFamily: "Arial",
    fontWeight: "400",
    fontStyle: "normal",
    shadow: null,
    textBackground: null,
  };
}

function makeProps(overrides: Partial<Parameters<typeof BulkTextPanel>[0]> = {}) {
  return {
    overlays: [makeOverlay("ov1"), makeOverlay("ov2")],
    textNodes: [makeTextNode("tn1", "Hello"), makeTextNode("tn2", "World")],
    itemTextValues: {},
    textLayerLocks: {},
    setItemTextValue: vi.fn(),
    setTextLayerLock: vi.fn(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("BulkTextPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Empty states
  it("shows overlay-empty message when overlays is empty", () => {
    const props = makeProps({ overlays: [] });
    render(<BulkTextPanel {...props} />);
    expect(screen.getByText(/no overlay items/i)).toBeInTheDocument();
  });

  it("shows text-node-empty message when textNodes is empty", () => {
    const props = makeProps({ textNodes: [] });
    render(<BulkTextPanel {...props} />);
    expect(screen.getByText(/no text layers/i)).toBeInTheDocument();
  });

  // One section per overlay
  it("renders one card section per overlay", () => {
    const props = makeProps();
    render(<BulkTextPanel {...props} />);
    // Each card has an aria-label containing the overlay filename
    expect(screen.getByLabelText(/ov1\.png/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ov2\.png/i)).toBeInTheDocument();
  });

  // One input per text layer per overlay
  it("renders one input per text layer per overlay", () => {
    const props = makeProps();
    render(<BulkTextPanel {...props} />);
    // 2 overlays × 2 text nodes = 4 inputs
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(4);
  });

  // Locked inputs are disabled
  it("locked inputs are disabled", () => {
    const props = makeProps({
      textLayerLocks: { tn1: true },
    });
    render(<BulkTextPanel {...props} />);

    // For each overlay card, the first layer (tn1) should be disabled
    const disabledInputs = screen
      .getAllByRole("textbox")
      .filter((el) => (el as HTMLInputElement).disabled);
    // 2 overlays × 1 locked layer = 2 disabled inputs
    expect(disabledInputs).toHaveLength(2);
  });

  // Unlocked inputs are enabled
  it("unlocked inputs are enabled", () => {
    const props = makeProps({
      textLayerLocks: { tn1: true },
    });
    render(<BulkTextPanel {...props} />);

    const enabledInputs = screen
      .getAllByRole("textbox")
      .filter((el) => !(el as HTMLInputElement).disabled);
    // 2 overlays × 1 unlocked layer (tn2) = 2 enabled inputs
    expect(enabledInputs).toHaveLength(2);
  });

  // All inputs unlocked by default
  it("all inputs are enabled when textLayerLocks is empty", () => {
    const props = makeProps();
    render(<BulkTextPanel {...props} />);

    const inputs = screen.getAllByRole("textbox");
    inputs.forEach((input) => {
      expect(input).not.toBeDisabled();
    });
  });

  // Typing calls setItemTextValue with correct overlay + node ids
  it("typing in an input calls setItemTextValue with correct ids and value", () => {
    const setItemTextValue = vi.fn();
    const props = makeProps({ setItemTextValue });
    render(<BulkTextPanel {...props} />);

    // First input belongs to ov1 / tn1 (unlocked)
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "New value" } });

    expect(setItemTextValue).toHaveBeenCalledTimes(1);
    expect(setItemTextValue).toHaveBeenCalledWith("ov1", "tn1", "New value");
  });

  it("typing in the second overlay's first input calls setItemTextValue with ov2", () => {
    const setItemTextValue = vi.fn();
    const props = makeProps({ setItemTextValue });
    render(<BulkTextPanel {...props} />);

    // Inputs order: ov1/tn1, ov1/tn2, ov2/tn1, ov2/tn2
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[2]!, { target: { value: "Override" } });

    expect(setItemTextValue).toHaveBeenCalledWith("ov2", "tn1", "Override");
  });

  // Clicking lock toggle calls setTextLayerLock
  it("clicking lock toggle on an unlocked layer calls setTextLayerLock with locked=true", () => {
    const setTextLayerLock = vi.fn();
    const props = makeProps({ setTextLayerLock, textLayerLocks: {} });
    render(<BulkTextPanel {...props} />);

    // All toggles for tn1 (layer 1): one per overlay
    const lockButtons = screen.getAllByRole("button", { name: /lock layer 1/i });
    fireEvent.click(lockButtons[0]!);

    expect(setTextLayerLock).toHaveBeenCalledTimes(1);
    expect(setTextLayerLock).toHaveBeenCalledWith("tn1", true);
  });

  it("clicking lock toggle on a locked layer calls setTextLayerLock with locked=false", () => {
    const setTextLayerLock = vi.fn();
    const props = makeProps({
      setTextLayerLock,
      textLayerLocks: { tn1: true },
    });
    render(<BulkTextPanel {...props} />);

    const unlockButtons = screen.getAllByRole("button", { name: /unlock layer 1/i });
    fireEvent.click(unlockButtons[0]!);

    expect(setTextLayerLock).toHaveBeenCalledTimes(1);
    expect(setTextLayerLock).toHaveBeenCalledWith("tn1", false);
  });

  // Locked row shows template value; unlocked shows per-item override
  it("locked input shows template content as its value", () => {
    const props = makeProps({
      textLayerLocks: { tn1: true },
      itemTextValues: { ov1: { tn1: "ignored override" } },
    });
    render(<BulkTextPanel {...props} />);

    // First input in first card (ov1/tn1) — locked, shows template content "Hello"
    const inputs = screen.getAllByRole("textbox");
    expect((inputs[0] as HTMLInputElement).value).toBe("Hello");
  });

  it("unlocked input shows per-item override value", () => {
    const props = makeProps({
      itemTextValues: { ov1: { tn1: "Custom text" } },
      textLayerLocks: {},
    });
    render(<BulkTextPanel {...props} />);

    const inputs = screen.getAllByRole("textbox");
    expect((inputs[0] as HTMLInputElement).value).toBe("Custom text");
  });

  it("unlocked input with no override shows empty value (placeholder is template content)", () => {
    const props = makeProps({
      itemTextValues: {},
      textLayerLocks: {},
    });
    render(<BulkTextPanel {...props} />);

    const inputs = screen.getAllByRole("textbox");
    // Empty string value, placeholder = template content
    expect((inputs[0] as HTMLInputElement).value).toBe("");
    expect((inputs[0] as HTMLInputElement).placeholder).toBe("Hello");
  });
});

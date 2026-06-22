import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkTextPanel } from "@/components/batch/BulkTextPanel";
import type { TextNode, NodeId } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";

// Mock TextStylePanel so Radix/Slider portals don't interfere with jsdom tests.
// The mock exposes a data-testid per node (using aria-label) and fires onChange on click.
vi.mock("@/components/text-style-panel", () => ({
  TextStylePanel: ({
    node,
    onChange,
    className,
  }: {
    node: { id: string };
    onChange: (patch: Record<string, unknown>) => void;
    className?: string;
  }) => (
    <div
      data-testid={`text-style-panel-${node.id}`}
      data-classname={className}
      onClick={() => onChange({ fontSize: 42 })}
    />
  ),
}));

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
    itemTextStyles: {},
    textLayerLocks: {},
    setItemTextValue: vi.fn(),
    setItemTextStyle: vi.fn(),
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
    // Each card has an aria-label starting with "Text layers for <filename>"
    expect(screen.getByLabelText(/text layers for ov1\.png/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/text layers for ov2\.png/i)).toBeInTheDocument();
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

  // ── Phase 2: multi-select + bulk edit ──────────────────────────────────────

  describe("BulkTextPanel — multi-select + bulk edit", () => {
    it("no-selection renders stacked view (no bulk edit section)", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      expect(screen.queryByLabelText(/bulk edit section/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/text layers for ov1\.png/i)).toBeInTheDocument();
    });

    it("checkbox toggles selection — selecting ov1 shows bulk edit section", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      const checkbox = screen.getByLabelText(/select ov1\.png/i);
      fireEvent.click(checkbox);
      expect(screen.getByLabelText(/bulk edit section/i)).toBeInTheDocument();
    });

    it("select-all checkbox selects all overlays", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      const selectAll = screen.getByLabelText(/select all/i);
      fireEvent.click(selectAll);
      expect(screen.getByLabelText(/bulk edit section/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select ov1\.png/i)).toBeChecked();
      expect(screen.getByLabelText(/select ov2\.png/i)).toBeChecked();
    });

    it("select-all when all selected deselects all", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      const selectAll = screen.getByLabelText(/select all/i);
      fireEvent.click(selectAll); // select all
      fireEvent.click(selectAll); // deselect all
      expect(screen.queryByLabelText(/bulk edit section/i)).not.toBeInTheDocument();
    });

    it("bulk edit: typing calls setItemTextValue for all selected unlocked items", () => {
      const setItemTextValue = vi.fn();
      const props = makeProps({ setItemTextValue });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      const bulkInput = screen.getByLabelText(/bulk edit text layer 1$/i);
      fireEvent.change(bulkInput, { target: { value: "Bulk text" } });

      expect(setItemTextValue).toHaveBeenCalledTimes(2);
      expect(setItemTextValue).toHaveBeenCalledWith("ov1", "tn1", "Bulk text");
      expect(setItemTextValue).toHaveBeenCalledWith("ov2", "tn1", "Bulk text");
    });

    it("bulk edit: locked node input is disabled and setItemTextValue NOT called", () => {
      const setItemTextValue = vi.fn();
      const props = makeProps({
        setItemTextValue,
        textLayerLocks: { tn1: true },
      });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      const bulkInput = screen.getByLabelText(/bulk edit text layer 1/i);
      expect(bulkInput).toBeDisabled();

      fireEvent.change(bulkInput, { target: { value: "Should not apply" } });
      expect(setItemTextValue).not.toHaveBeenCalled();
    });

    it("bulk edit: diverging values shows (multiple values) placeholder", () => {
      const props = makeProps({
        itemTextValues: { ov1: { tn1: "Apple" }, ov2: { tn1: "Banana" } },
      });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      const bulkInput = screen.getByLabelText(/bulk edit text layer 1$/i) as HTMLInputElement;
      expect(bulkInput.value).toBe("");
      expect(bulkInput.placeholder).toBe("(multiple values)");
    });

    it("bulk edit: identical values across selected items shows the shared value", () => {
      const props = makeProps({
        itemTextValues: { ov1: { tn1: "Same" }, ov2: { tn1: "Same" } },
      });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      const bulkInput = screen.getByLabelText(/bulk edit text layer 1$/i) as HTMLInputElement;
      expect(bulkInput.value).toBe("Same");
    });
  });

  // ── Phase 3b: per-variant text styling ────────────────────────────────────

  describe("BulkTextPanel — per-variant text styling", () => {
    it("no-selection hides the style panel", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      expect(screen.queryByTestId("text-style-panel-tn1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("text-style-panel-tn2")).not.toBeInTheDocument();
    });

    it("selecting items shows a style panel per text node", () => {
      const props = makeProps();
      render(<BulkTextPanel {...props} />);
      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      expect(screen.getByTestId("text-style-panel-tn1")).toBeInTheDocument();
      expect(screen.getByTestId("text-style-panel-tn2")).toBeInTheDocument();
    });

    it("style panel onChange calls setItemTextStyle for all selected unlocked items", () => {
      const setItemTextStyle = vi.fn();
      const props = makeProps({ setItemTextStyle });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      // Clicking the mock panel for tn1 fires onChange({ fontSize: 42 })
      fireEvent.click(screen.getByTestId("text-style-panel-tn1"));

      expect(setItemTextStyle).toHaveBeenCalledTimes(2);
      expect(setItemTextStyle).toHaveBeenCalledWith("ov1", "tn1", { fontSize: 42 });
      expect(setItemTextStyle).toHaveBeenCalledWith("ov2", "tn1", { fontSize: 42 });
    });

    it("locked node style panel is visually disabled (opacity class) and setItemTextStyle NOT called", () => {
      const setItemTextStyle = vi.fn();
      const props = makeProps({
        setItemTextStyle,
        textLayerLocks: { tn1: true },
      });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));
      fireEvent.click(screen.getByLabelText(/select ov2\.png/i));

      const panel = screen.getByTestId("text-style-panel-tn1");
      // Locked panels receive the disabled class string containing pointer-events-none
      expect(panel.dataset.classname).toMatch(/pointer-events-none/);

      // Clicking it still fires the DOM event, but the handler guards against locked layers
      fireEvent.click(panel);
      expect(setItemTextStyle).not.toHaveBeenCalled();
    });

    it("unlocked node style panel onChange is not guarded — setItemTextStyle called", () => {
      const setItemTextStyle = vi.fn();
      const props = makeProps({
        setItemTextStyle,
        textLayerLocks: { tn1: true }, // tn1 locked, tn2 unlocked
      });
      render(<BulkTextPanel {...props} />);

      fireEvent.click(screen.getByLabelText(/select ov1\.png/i));

      // tn2 is unlocked — onChange should fire through
      fireEvent.click(screen.getByTestId("text-style-panel-tn2"));
      expect(setItemTextStyle).toHaveBeenCalledWith("ov1", "tn2", { fontSize: 42 });
    });
  });
});

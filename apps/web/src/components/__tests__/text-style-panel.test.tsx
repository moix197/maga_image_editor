import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextStylePanel } from "@/components/text-style-panel";
import type { TextNode, NodeId } from "@maga/editor";

// Note: the Select component (font family / weight / style) uses a native <select>
// overlay in the current stub implementation, so value changes can be fired via
// fireEvent.change on the combobox role element.
// When the full Radix-based shadcn Select is wired up, these tests may need to be
// replaced with Playwright/Cypress e2e tests that can interact with Radix portals.

const mockNode: TextNode = {
  id: "test-id" as NodeId,
  content: "Hello",
  x: 50,
  y: 50,
  rotation: 0,
  zIndex: 0,
  fontSize: 24,
  color: "#ffffff",
  opacity: 1,
  fontFamily: "Inter",
  fontWeight: "normal",
  fontStyle: "normal",
  shadow: null,
  textBackground: null,
};

describe("TextStylePanel", () => {
  let onChange: (patch: Partial<TextNode>) => void;
  const noop = vi.fn();

  beforeEach(() => {
    onChange = vi.fn() as unknown as (patch: Partial<TextNode>) => void;
  });

  // ── Font family ──────────────────────────────────────────────────────────────

  it("fires onChange with fontFamily when font family select changes", () => {
    render(<TextStylePanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    // First combobox is font family
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0]!, { target: { value: "Roboto" } });
    expect(onChange).toHaveBeenCalledWith({ fontFamily: "Roboto" });
  });

  // ── Font size ────────────────────────────────────────────────────────────────

  it("fires onChange with fontSize when number input changes", () => {
    render(<TextStylePanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "48" } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 48 });
  });

  it("passes current fontSize as the input value", () => {
    render(<TextStylePanel node={{ ...mockNode, fontSize: 36 }} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("36");
  });

  // ── Color ────────────────────────────────────────────────────────────────────

  it("fires onChange with color when color input changes", () => {
    render(<TextStylePanel node={mockNode} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const colorInput = screen.getByLabelText("Text color") as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    expect(onChange).toHaveBeenCalledWith({ color: "#ff0000" });
  });

  it("passes current color as the color input value", () => {
    render(<TextStylePanel node={{ ...mockNode, color: "#123456" }} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const colorInput = screen.getByLabelText("Text color") as HTMLInputElement;
    expect(colorInput.value).toBe("#123456");
  });

  // ── Opacity slider ───────────────────────────────────────────────────────────

  it("fires onChange with opacity when slider value changes", () => {
    render(<TextStylePanel node={{ ...mockNode, opacity: 1 }} onChange={onChange} onDelete={noop} onReorder={noop} />);
    // First range input is opacity (blur slider only renders when shadow is enabled)
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    const opacityRange = rangeInputs[0] as HTMLInputElement;
    fireEvent.change(opacityRange, { target: { value: "0.5" } });
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.5 });
  });

  it("reflects current opacity in slider aria-valuenow", () => {
    render(<TextStylePanel node={{ ...mockNode, opacity: 0.75 }} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const slider = screen.getByRole("slider", { name: /opacity/i });
    expect(slider).toHaveAttribute("aria-valuenow", "0.75");
  });

  // ── Shadow toggle (off → on) ─────────────────────────────────────────────────

  it("fires onChange with default shadow when checkbox is toggled on", () => {
    render(<TextStylePanel node={{ ...mockNode, shadow: null }} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const checkbox = screen.getByRole("checkbox", { name: "Enable shadow" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({
      shadow: { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 },
    });
  });

  // ── Shadow toggle (on → off) ─────────────────────────────────────────────────

  it("fires onChange with shadow: null when checkbox is toggled off", () => {
    const nodeWithShadow: TextNode = {
      ...mockNode,
      shadow: { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 },
    };
    render(<TextStylePanel node={nodeWithShadow} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const checkbox = screen.getByRole("checkbox", { name: "Enable shadow" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ shadow: null });
  });

  // ── Shadow sub-controls (only visible when shadow is enabled) ────────────────

  it("shows shadow color and blur controls only when shadow is enabled", () => {
    const { rerender } = render(
      <TextStylePanel node={{ ...mockNode, shadow: null }} onChange={onChange} onDelete={noop} onReorder={noop} />
    );
    expect(screen.queryByLabelText("Shadow color")).not.toBeInTheDocument();

    rerender(
      <TextStylePanel
        node={{ ...mockNode, shadow: { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 } }}
        onChange={onChange}
        onDelete={noop}
        onReorder={noop}
      />
    );
    expect(screen.getByLabelText("Shadow color")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /shadow blur/i })).toBeInTheDocument();
  });

  it("fires onChange with updated shadow color when shadow color input changes", () => {
    const nodeWithShadow: TextNode = {
      ...mockNode,
      shadow: { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 },
    };
    render(<TextStylePanel node={nodeWithShadow} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const shadowColorInput = screen.getByLabelText("Shadow color") as HTMLInputElement;
    fireEvent.change(shadowColorInput, { target: { value: "#ff0000" } });
    expect(onChange).toHaveBeenCalledWith({
      shadow: { color: "#ff0000", blur: 4, offsetX: 2, offsetY: 2 },
    });
  });

  it("fires onChange with updated shadow blur when blur slider changes", () => {
    const nodeWithShadow: TextNode = {
      ...mockNode,
      shadow: { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 },
    };
    render(<TextStylePanel node={nodeWithShadow} onChange={onChange} onDelete={noop} onReorder={noop} />);
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    // With shadow enabled: index 0 = opacity, index 1 = rotation, index 2 = shadow blur
    const blurRange = rangeInputs[2] as HTMLInputElement;
    fireEvent.change(blurRange, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith({
      shadow: { color: "#000000", blur: 10, offsetX: 2, offsetY: 2 },
    });
  });
});

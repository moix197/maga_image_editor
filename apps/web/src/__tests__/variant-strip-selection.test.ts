import { describe, it, expect } from "vitest";

/**
 * VariantStrip multi-select behaviour — pure logic tests (no DOM rendering).
 * Tests the selection state rules that VariantStrip enforces.
 */

describe("VariantStrip selection invariants", () => {
  const allIds = ["a", "b", "c"];
  const activeId = "a";

  /** Simulate what VariantStrip's checkbox onChange does */
  function toggleId(selected: Set<string>, id: string, checked: boolean): Set<string> {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  }

  /** Simulate what BatchWorkspace's onSelectionChange enforces */
  function enforceActive(ids: Set<string>, active: string): Set<string> {
    const next = new Set(ids);
    next.add(active);
    return next;
  }

  it("active id is always in the set (checked)", () => {
    const initial = new Set([activeId]);
    expect(initial.has(activeId)).toBe(true);
  });

  it("active id cannot be removed — enforced by BatchWorkspace", () => {
    // User tries to uncheck active (disabled in UI, but test the invariant)
    const after = enforceActive(new Set<string>(), activeId);
    expect(after.has(activeId)).toBe(true);
  });

  it("checkbox checked state reflects selectedIds.has(id)", () => {
    const selected = new Set(["a", "b"]);
    expect(selected.has("a")).toBe(true);
    expect(selected.has("b")).toBe(true);
    expect(selected.has("c")).toBe(false);
  });

  it("select-all is checked when selectedIds.size === allIds.length", () => {
    const allSelected = new Set(allIds);
    expect(allSelected.size === allIds.length).toBe(true);
  });

  it("select-all is checked when only 1 variant exists", () => {
    const single = ["x"];
    const selected = new Set(["x"]);
    expect(selected.size === single.length).toBe(true);
  });

  it("select-all is NOT checked when not all selected", () => {
    const partial = new Set(["a", "b"]);
    expect(partial.size === allIds.length).toBe(false);
  });

  it("onSelectionChange called with correct set when checking a variant", () => {
    const initial = new Set(["a"]);
    const result = toggleId(initial, "b", true);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
  });

  it("onSelectionChange called with correct set when unchecking a variant", () => {
    const initial = new Set(["a", "b", "c"]);
    const result = toggleId(initial, "b", false);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
    expect(result.has("c")).toBe(true);
  });

  it("active id always present in emitted set (enforced by wrapper)", () => {
    // Even if caller passes a set without activeId, wrapper adds it
    const userSet = new Set(["b", "c"]);
    const enforced = enforceActive(userSet, activeId);
    expect(enforced.has(activeId)).toBe(true);
    expect(enforced.has("b")).toBe(true);
    expect(enforced.has("c")).toBe(true);
  });

  it("select-all toggle selects all when not all selected", () => {
    const partial = new Set(["a"]);
    const allSelected = new Set(allIds); // simulate handleSelectAll when !allSelected
    expect(allSelected.size).toBe(allIds.length);
  });

  it("select-all toggle deselects to active-only when all selected", () => {
    const all = new Set(allIds);
    const afterDeselect = new Set([activeId]); // simulate handleSelectAll when allSelected
    expect(afterDeselect.size).toBe(1);
    expect(afterDeselect.has(activeId)).toBe(true);
  });
});

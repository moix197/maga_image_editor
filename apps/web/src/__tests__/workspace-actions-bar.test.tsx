import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceActionsBar } from "@/components/batch/WorkspaceActionsBar";

function makeHandlers() {
  return {
    onGeneratePreview: vi.fn(),
    onGenerateAll: vi.fn(),
    onCancel: vi.fn(),
    onImportZip: vi.fn(),
    onExportZip: vi.fn(),
    onClearProject: vi.fn(),
  };
}

describe("WorkspaceActionsBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all six action buttons", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import zip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export zip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear project/i })).toBeInTheDocument();
  });

  it("fires onGeneratePreview when Generate Preview is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    expect(handlers.onGeneratePreview).toHaveBeenCalledTimes(1);
  });

  it("fires onGenerateAll when Generate All is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /generate all/i }));
    expect(handlers.onGenerateAll).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when Cancel is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onImportZip when Import ZIP is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /import zip/i }));
    expect(handlers.onImportZip).toHaveBeenCalledTimes(1);
  });

  it("fires onExportZip when Export ZIP is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /export zip/i }));
    expect(handlers.onExportZip).toHaveBeenCalledTimes(1);
  });

  it("fires onClearProject when Clear Project is clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /clear project/i }));
    expect(handlers.onClearProject).toHaveBeenCalledTimes(1);
  });

  it("Generate Preview button is disabled when generatePreviewDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} generatePreviewDisabled />);
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeDisabled();
  });

  it("Generate All button is disabled when generateAllDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} generateAllDisabled />);
    expect(screen.getByRole("button", { name: /generate all/i })).toBeDisabled();
  });

  it("Cancel button is disabled when cancelDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} cancelDisabled />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("Import ZIP button is disabled when importZipDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} importZipDisabled />);
    expect(screen.getByRole("button", { name: /import zip/i })).toBeDisabled();
  });

  it("Export ZIP button is disabled when exportZipDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} exportZipDisabled />);
    expect(screen.getByRole("button", { name: /export zip/i })).toBeDisabled();
  });

  it("Clear Project button is disabled when clearProjectDisabled is true", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} clearProjectDisabled />);
    expect(screen.getByRole("button", { name: /clear project/i })).toBeDisabled();
  });

  it("disabled buttons do not fire callbacks when clicked", () => {
    const handlers = makeHandlers();
    render(<WorkspaceActionsBar {...handlers} generatePreviewDisabled exportZipDisabled />);
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    fireEvent.click(screen.getByRole("button", { name: /export zip/i }));
    expect(handlers.onGeneratePreview).not.toHaveBeenCalled();
    expect(handlers.onExportZip).not.toHaveBeenCalled();
  });
});

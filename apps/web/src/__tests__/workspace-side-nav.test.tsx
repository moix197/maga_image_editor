import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceSideNav } from "@/components/batch/WorkspaceSideNav";

const mockPush = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: mockGet,
    toString: () => "",
  }),
}));

describe("WorkspaceSideNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // default: no section param → "assets"
  });

  it("renders all four section tabs", () => {
    render(<WorkspaceSideNav />);
    expect(screen.getByRole("tab", { name: /assets/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /template/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /text/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /results/i })).toBeInTheDocument();
  });

  it("marks Assets as active by default (no section param)", () => {
    mockGet.mockReturnValue(null);
    render(<WorkspaceSideNav />);
    const assetsTab = screen.getByRole("tab", { name: /assets/i });
    expect(assetsTab).toHaveAttribute("aria-selected", "true");
  });

  it("marks Template as active when section=template", () => {
    mockGet.mockReturnValue("template");
    render(<WorkspaceSideNav />);
    expect(screen.getByRole("tab", { name: /template/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /assets/i })).toHaveAttribute("aria-selected", "false");
  });

  it("marks Text as active when section=text", () => {
    mockGet.mockReturnValue("text");
    render(<WorkspaceSideNav />);
    expect(screen.getByRole("tab", { name: /text/i })).toHaveAttribute("aria-selected", "true");
  });

  it("marks Results as active when section=results", () => {
    mockGet.mockReturnValue("results");
    render(<WorkspaceSideNav />);
    expect(screen.getByRole("tab", { name: /results/i })).toHaveAttribute("aria-selected", "true");
  });

  it("calls router.push with ?section=template when Template tab is clicked", () => {
    mockGet.mockReturnValue(null);
    render(<WorkspaceSideNav />);
    fireEvent.click(screen.getByRole("tab", { name: /template/i }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("section=template"));
  });

  it("calls router.push with ?section=results when Results tab is clicked", () => {
    mockGet.mockReturnValue(null);
    render(<WorkspaceSideNav />);
    fireEvent.click(screen.getByRole("tab", { name: /results/i }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("section=results"));
  });

  it("does not call any business-logic side effects on click", () => {
    // Verify that clicking tabs only triggers router navigation, nothing else
    render(<WorkspaceSideNav />);
    const tabCount = screen.getAllByRole("tab").length;
    expect(tabCount).toBe(4);
    fireEvent.click(screen.getByRole("tab", { name: /text/i }));
    // Only push was called — no other unexpected effects
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

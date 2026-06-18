import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareLayout } from "@/components/compare-layout";

describe("CompareLayout", () => {
  it("renders left child content", () => {
    render(<CompareLayout left={<span>Left content</span>} right={<span>Right</span>} />);
    expect(screen.getByText("Left content")).toBeInTheDocument();
  });

  it("renders right child content", () => {
    render(<CompareLayout left={<span>Left</span>} right={<span>Right content</span>} />);
    expect(screen.getByText("Right content")).toBeInTheDocument();
  });

  it("wrapper div has grid class", () => {
    const { container } = render(<CompareLayout left={<span>L</span>} right={<span>R</span>} />);
    expect(container.firstChild).toHaveClass("grid");
  });
});

import React from "react";

interface CompareLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function CompareLayout({ left, right }: CompareLayoutProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

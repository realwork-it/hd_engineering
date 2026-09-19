"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>🖨 인쇄</button>;
}

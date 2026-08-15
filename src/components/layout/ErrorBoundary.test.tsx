import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function BrokenScreen(): never {
  throw new Error("unexpected render data");
}

describe("ErrorBoundary", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("shows a recoverable screen when a page crashes", () => {
    render(<ErrorBoundary><BrokenScreen /></ErrorBoundary>);
    expect(screen.getByRole("heading", { name: /no se pudo mostrar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recargar/i })).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DraftProvider, useDraft } from "./DraftContext";

afterEach(cleanup);

function DraftEditor() {
  const { draft, saveDraft, clearDraft } = useDraft<{ name: string }>("test-draft");
  return <div>
    <span>{draft?.name ?? "sin borrador"}</span>
    <button type="button" onClick={() => saveDraft({ name: "Paciente en proceso" })}>Guardar temporal</button>
    <button type="button" onClick={clearDraft}>Descartar</button>
  </div>;
}

function DraftJourney() {
  const [editing, setEditing] = useState(true);
  return <div>
    <button type="button" onClick={() => setEditing((current) => !current)}>Cambiar pagina</button>
    {editing ? <DraftEditor /> : <span>Otra pagina</span>}
  </div>;
}

describe("DraftProvider", () => {
  it("recupera un borrador al volver a un formulario durante la misma sesion", () => {
    render(<DraftProvider><DraftJourney /></DraftProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Guardar temporal" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pagina" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pagina" }));

    expect(screen.getByText("Paciente en proceso")).toBeInTheDocument();
  });

  it("permite descartar el borrador", () => {
    render(<DraftProvider><DraftJourney /></DraftProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Guardar temporal" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pagina" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pagina" }));

    expect(screen.getByText("sin borrador")).toBeInTheDocument();
  });
});
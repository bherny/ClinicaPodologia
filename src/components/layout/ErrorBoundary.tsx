import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Body Feet app error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fallback-page">
        <div className="fallback-card">
          <img src="/logo-body-feet.png" alt="Body Feet" />
          <h1>No se pudo mostrar esta pantalla</h1>
          <p>La aplicacion encontro un dato inesperado. Recarga la pantalla para continuar.</p>
          <Button type="button" variant="primary" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </main>
    );
  }
}

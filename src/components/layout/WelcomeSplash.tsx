import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/Button";

const WELCOME_DURATION_MS = 4_000;

export function WelcomeSplash({ name, onFinish }: { name: string; onFinish: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onFinish, WELCOME_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="welcome-splash" role="dialog" aria-modal="true" aria-label="Bienvenida a Body Feet">
      <div className="welcome-splash__content">
        <div className="welcome-splash__character" aria-hidden="true">
          <img src="/body-feet-nurse.png" alt="" loading="eager" decoding="async" fetchPriority="high" />
        </div>
        <div className="welcome-splash__copy">
          <img src="/favicon.png" alt="Body Feet" />
          <span>Centro de Podología y Rehabilitación</span>
          <h1>¡Bienvenido, {name}!</h1>
          <p>Que hoy sea una jornada de cuidado, precisión y buenos resultados para cada paciente.</p>
          <Button type="button" variant="primary" onClick={onFinish}>Ingresar ahora <ArrowRight /></Button>
        </div>
      </div>
      <div className="welcome-splash__progress" aria-hidden="true"><span /></div>
    </div>
  );
}

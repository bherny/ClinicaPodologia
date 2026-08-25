import { Eraser, Undo2 } from "lucide-react";
import type { PointerEvent } from "react";
import type { PuntoDolorCorporal } from "../../types/domain";
import { Button } from "../ui/Button";

type BodyPainMapProps = {
  points: PuntoDolorCorporal[];
  onChange?: (points: PuntoDolorCorporal[]) => void;
  readOnly?: boolean;
};

export function BodyPainMap({ points, onChange, readOnly = false }: BodyPainMapProps) {
  const addPoint = (event: PointerEvent<HTMLDivElement>) => {
    if (readOnly || !onChange || points.length >= 40) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    onChange([...points, {
      x: Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
      y: Math.round(Math.min(100, Math.max(0, y)) * 10) / 10
    }]);
  };

  return (
    <div className="body-pain-map">
      <div
        className={`body-pain-map__canvas${readOnly ? " body-pain-map__canvas--readonly" : ""}`}
        role="img"
        aria-label={`Mapa corporal con ${points.length} zonas de dolor marcadas`}
        onPointerDown={addPoint}
      >
        <img src="/clinical-body-map.jpg" alt="Esquema anatómico frontal, lateral y posterior" draggable={false} />
        {points.map((point, index) => (
          <span
            className="body-pain-map__point"
            key={`${point.x}-${point.y}-${index}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {!readOnly && onChange ? (
        <div className="body-pain-map__toolbar">
          <span>{points.length ? `${points.length} ${points.length === 1 ? "zona marcada" : "zonas marcadas"}` : "Sin zonas marcadas"}</span>
          <div>
            <Button type="button" disabled={!points.length} onClick={() => onChange(points.slice(0, -1))} title="Deshacer última marca">
              <Undo2 /> Deshacer
            </Button>
            <Button type="button" disabled={!points.length} onClick={() => onChange([])} title="Limpiar todas las marcas">
              <Eraser /> Limpiar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
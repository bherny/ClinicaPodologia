import { useCallback, useEffect, useRef } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { drawSignature } from "../../lib/signature";
import type { SignaturePoint, SignatureStroke } from "../../services/signatures";

export function SignaturePad({ value, onChange, disabled = false }: { value: SignatureStroke[]; onChange: (strokes: SignatureStroke[]) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<SignaturePoint[] | null>(null);
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) drawSignature(canvas, value, { width: canvas.parentElement?.clientWidth ?? 600, height: 190, background: "#ffffff" });
  }, [value]);

  useEffect(() => {
    redraw();
    const observer = new ResizeObserver(redraw);
    const parent = canvasRef.current?.parentElement;
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  };
  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || value.length >= 50) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStroke.current = [pointFromEvent(event)];
  };
  const extendStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current) return;
    const nextPoint = pointFromEvent(event);
    const previous = activeStroke.current.at(-1);
    if (previous && Math.hypot(nextPoint.x - previous.x, nextPoint.y - previous.y) < 0.0025) return;
    activeStroke.current.push(nextPoint);
    const canvas = canvasRef.current;
    if (canvas) drawSignature(canvas, [...value, activeStroke.current], { width: canvas.parentElement?.clientWidth ?? 600, height: 190, background: "#ffffff" });
  };
  const finishStroke = () => {
    const stroke = activeStroke.current;
    activeStroke.current = null;
    if (stroke?.length) onChange([...value, stroke.slice(0, 1000)]);
  };

  return <div className="signature-pad">
    <div className="signature-pad__canvas">
      <canvas ref={canvasRef} aria-label="Area para dibujar la firma" onPointerDown={beginStroke} onPointerMove={extendStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} />
      {!value.length ? <span>Firme dentro del recuadro</span> : null}
    </div>
    <div className="signature-pad__toolbar">
      <small>Use el dedo, mouse o lapiz tactil.</small>
      <div className="inline">
        <Button type="button" disabled={disabled || !value.length} title="Deshacer ultimo trazo" onClick={() => onChange(value.slice(0, -1))}><RotateCcw /></Button>
        <Button type="button" variant="danger" disabled={disabled || !value.length} title="Limpiar firma" onClick={() => onChange([])}><Trash2 /></Button>
      </div>
    </div>
  </div>;
}

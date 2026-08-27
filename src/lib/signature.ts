import type { SignatureStroke } from "../services/signatures";
export function drawSignature(canvas: HTMLCanvasElement, strokes: SignatureStroke[], options: { width?: number; height?: number; color?: string; background?: string } = {}) {
  const bounds = canvas.getBoundingClientRect();
  const cssWidth = options.width ?? bounds.width ?? 600;
  const cssHeight = options.height ?? bounds.height ?? 190;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
  canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
  canvas.style.width = String(cssWidth) + "px";
  canvas.style.height = String(cssHeight) + "px";
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);
  if (options.background) { context.fillStyle = options.background; context.fillRect(0, 0, cssWidth, cssHeight); }
  else context.clearRect(0, 0, cssWidth, cssHeight);
  context.strokeStyle = options.color ?? "#18324a";
  context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = Math.max(2, cssWidth / 260);
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    context.beginPath(); context.moveTo(stroke[0].x * cssWidth, stroke[0].y * cssHeight);
    for (let index = 1; index < stroke.length; index += 1) context.lineTo(stroke[index].x * cssWidth, stroke[index].y * cssHeight);
    if (stroke.length === 1) context.lineTo(stroke[0].x * cssWidth + 0.1, stroke[0].y * cssHeight + 0.1);
    context.stroke();
  }
}
export function signatureToDataUrl(strokes: SignatureStroke[], width = 800, height = 260, background = "#ffffff") {
  const canvas = document.createElement("canvas");
  drawSignature(canvas, strokes, { width, height, background });
  return canvas.toDataURL("image/png");
}

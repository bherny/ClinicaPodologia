import { describe, expect, it } from "vitest";
import {
  clinicalHistorySchema,
  createEmptyClinicalEvaluation,
  normalizeClinicalEvaluation
} from "../services/history";

const patientId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";

describe("complete clinical history", () => {
  it("keeps the complete three-page evaluation structure", () => {
    const evaluation = createEmptyClinicalEvaluation();

    expect(evaluation).toMatchObject({
      version: 1,
      motivo_consulta: "",
      sintomas_presentes: "",
      localizacion_dolor_puntos: [],
      tests: ["", "", ""],
      hipotesis_diagnostico: ["", "", ""],
      trabajo_casa: ""
    });
    expect(Object.keys(evaluation)).toHaveLength(52);
  });

  it("normalizes legacy or incomplete evaluations without losing valid data", () => {
    const normalized = normalizeClinicalEvaluation({
      motivo_consulta: "Dolor lumbar",
      peor: ["sentado", "valor_invalido"] as never,
      tests: ["Lasègue positivo"] as never,
      localizacion_dolor_puntos: [
        { x: -8, y: 118 },
        { x: Number.NaN, y: 20 }
      ]
    });

    expect(normalized.motivo_consulta).toBe("Dolor lumbar");
    expect(normalized.peor).toEqual(["sentado"]);
    expect(normalized.tests).toEqual(["Lasègue positivo", "", ""]);
    expect(normalized.localizacion_dolor_puntos).toEqual([{ x: 0, y: 100 }]);
  });

  it("rejects invalid dates, pain scale values and map coordinates", () => {
    const result = clinicalHistorySchema.safeParse({
      paciente_id: patientId,
      cita_id: null,
      sede_id: branchId,
      profesional_id: null,
      fecha_evaluacion: "1500-01-01",
      diagnostico: "",
      tratamiento_realizado: "",
      evolucion: "",
      recomendaciones: "",
      proxima_fecha_sugerida: null,
      evaluacion: {
        ...createEmptyClinicalEvaluation(),
        eva: "11",
        localizacion_dolor_puntos: [{ x: 101, y: 50 }]
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(expect.arrayContaining([
        "fecha_evaluacion",
        "evaluacion.eva",
        "evaluacion.localizacion_dolor_puntos.0.x"
      ]));
    }
  });
});

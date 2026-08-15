import { describe, expect, it } from "vitest";
import { appointmentPatientPhone, fullName, money, normalizePhone } from "./format";
import type { CitaDetalle } from "../types/domain";

describe("format helpers", () => {
  it("formats names and missing people safely", () => {
    expect(fullName({ nombres: "  Ana", apellidos: "Torres  " })).toBe("Ana Torres");
    expect(fullName(null)).toBe("Sin asignar");
  });

  it("formats Peruvian currency and missing prices", () => {
    expect(money(null)).toBe("Sin precio");
    expect(money(125.5)).toMatch(/125[,.]50/);
  });

  it("normalizes phones and reads the appointment patient phone", () => {
    expect(normalizePhone("+51 993-465-858")).toBe("51993465858");
    expect(appointmentPatientPhone({ paciente: { telefono: "993465858" } } as CitaDetalle)).toBe("993465858");
    expect(appointmentPatientPhone({ paciente: null } as CitaDetalle)).toBe("");
  });
});

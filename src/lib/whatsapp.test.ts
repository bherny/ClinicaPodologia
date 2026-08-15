import { describe, expect, it } from "vitest";
import { buildReminderMessage, buildWhatsAppUrl, hasValidWhatsAppPhone } from "./whatsapp";
import type { CitaDetalle } from "../types/domain";

const appointment = {
  fecha: "2026-08-16",
  hora_inicio: "09:30:00",
  paciente: { nombres: "Ana", apellidos: "Torres", telefono: "999 111 222" },
  servicio: { nombre: "Podologia" },
  sede: { nombre: "Musa" }
} as CitaDetalle;

describe("WhatsApp helpers", () => {
  it("builds a complete reminder without template placeholders", () => {
    const message = buildReminderMessage(appointment);
    expect(message).toContain("Ana Torres");
    expect(message).toContain("Podologia");
    expect(message).toContain("Musa");
    expect(message).not.toContain("[");
  });

  it("normalizes Peru numbers and encodes the message", () => {
    expect(buildWhatsAppUrl("+51 999 111 222", "Hola Body Feet")).toBe("https://wa.me/51999111222?text=Hola%20Body%20Feet");
    expect(hasValidWhatsAppPhone("999 111 222")).toBe(true);
    expect(hasValidWhatsAppPhone("123")).toBe(false);
  });
});

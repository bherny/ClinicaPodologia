import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPatientPortalSession,
  hasPatientPortalSession,
  normalizePatientPhone
} from "./patientPortal";

describe("patient portal security helpers", () => {
  beforeEach(() => sessionStorage.clear());

  it("normalizes local and international Peru phone formats", () => {
    expect(normalizePatientPhone("999 111 222")).toBe("999111222");
    expect(normalizePatientPhone("+51 999 111 222")).toBe("999111222");
    expect(() => normalizePatientPhone("123")).toThrow(/celular valido/i);
  });

  it("does not report a portal session after it is cleared", () => {
    sessionStorage.setItem("bodyfeet:patient-portal-token", "token");
    expect(hasPatientPortalSession()).toBe(true);
    clearPatientPortalSession();
    expect(hasPatientPortalSession()).toBe(false);
  });
});

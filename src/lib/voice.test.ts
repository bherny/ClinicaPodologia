import { describe, expect, it } from "vitest";
import {
  appendDictation,
  mergeVoiceValue,
  spokenDigitsToString,
  spokenNumberToString
} from "./voice";

describe("voice normalization", () => {
  it("converts spoken DNI and phone digits", () => {
    expect(spokenDigitsToString("nueve nueve tres doble cuatro seis ocho cinco ocho")).toBe("993446858");
    expect(spokenDigitsToString("UNO dos tres")).toBe("123");
  });

  it("converts spoken monetary amounts", () => {
    expect(spokenNumberToString("ciento veinte")).toBe("120");
    expect(spokenNumberToString("doscientos treinta y cinco coma cinco cero")).toBe("235.50");
    expect(spokenNumberToString("menos quince")).toBe("-15");
  });

  it("merges text, digits and numeric values according to field mode", () => {
    expect(appendDictation("Dolor", "en talon")).toBe("Dolor en talon");
    expect(mergeVoiceValue("99", "tres cuatro", "digits")).toBe("9934");
    expect(mergeVoiceValue("0", "cuarenta", "number")).toBe("40");
    expect(mergeVoiceValue("secreto", "texto", "off")).toBe("secreto");
  });
});

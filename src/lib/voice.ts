export type VoiceInputMode = "text" | "number" | "digits" | "off";

const DIGITS: Record<string, string> = {
  cero: "0",
  uno: "1",
  un: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9"
};

const CARDINALS: Record<string, number> = {
  cero: 0,
  uno: 1,
  un: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900
};

function normalizeSpeech(value: string) {
  return value
    .toLocaleLowerCase("es-PE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9,.-]+/g, " ")
    .trim();
}

function digitSequence(tokens: string[]) {
  let result = "";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const repeat = token === "doble" ? 2 : token === "triple" ? 3 : 1;
    const candidate = repeat > 1 ? tokens[index + 1] : token;
    const digit = DIGITS[candidate] ?? (/^\d+$/.test(candidate) ? candidate : "");
    if (!digit) continue;
    result += digit.repeat(repeat);
    if (repeat > 1) index += 1;
  }
  return result;
}

function integerFromWords(tokens: string[]) {
  let total = 0;
  let current = 0;
  let recognized = false;

  for (const token of tokens) {
    if (token === "y") continue;
    if (token === "mil") {
      total += (current || 1) * 1_000;
      current = 0;
      recognized = true;
      continue;
    }
    if (["millon", "millones"].includes(token)) {
      total += (current || 1) * 1_000_000;
      current = 0;
      recognized = true;
      continue;
    }
    const value = CARDINALS[token];
    if (value !== undefined) {
      current += value;
      recognized = true;
      continue;
    }
    if (/^\d+$/.test(token)) {
      current += Number(token);
      recognized = true;
    }
  }

  return recognized ? total + current : null;
}

export function spokenDigitsToString(transcript: string) {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) return "";
  return digitSequence(normalized.split(/\s+/));
}

export function spokenNumberToString(transcript: string) {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) return "";

  const literal = normalized.match(/-?\d+(?:[.,]\d+)?/);
  if (literal && normalized.split(/\s+/).every((token) => /^-?\d+(?:[.,]\d+)?$/.test(token))) {
    return literal[0].replace(",", ".");
  }

  const negative = normalized.startsWith("menos ");
  const clean = negative ? normalized.slice(6) : normalized;
  const parts = clean.split(/\s+(?:coma|punto)\s+/);
  const integerTokens = parts[0].split(/\s+/);
  const integer = integerFromWords(integerTokens);
  if (integer === null) return literal?.[0].replace(",", ".") ?? "";

  let result = `${negative ? "-" : ""}${integer}`;
  if (parts[1]) {
    const decimalTokens = parts[1].split(/\s+/);
    const decimals = digitSequence(decimalTokens) || `${integerFromWords(decimalTokens) ?? ""}`;
    if (decimals) result += `.${decimals}`;
  }
  return result;
}

export function appendDictation(currentValue: string | null | undefined, transcript: string) {
  const current = currentValue?.trimEnd() ?? "";
  const next = transcript.trim();
  if (!next) return currentValue ?? "";
  return current ? `${current} ${next}` : next;
}

export function mergeVoiceValue(currentValue: string, transcript: string, mode: VoiceInputMode) {
  if (mode === "text") return appendDictation(currentValue, transcript);
  if (mode === "digits") {
    const digits = spokenDigitsToString(transcript);
    return digits ? `${currentValue}${digits}` : currentValue;
  }
  if (mode === "number") {
    const number = spokenNumberToString(transcript);
    return number || currentValue;
  }
  return currentValue;
}

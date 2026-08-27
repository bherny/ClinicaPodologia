const OPENINGS = [
  "Cada paso de hoy",
  "Tu dedicacion diaria",
  "Una atencion hecha con cuidado",
  "El trabajo en equipo",
  "Tu actitud positiva",
  "Cada paciente atendido con respeto",
  "La constancia en los pequenos detalles",
  "Escuchar con empatia",
  "Aprender algo nuevo hoy",
  "Una sonrisa sincera",
  "La paciencia y el buen trato",
  "Organizar bien cada tarea",
  "Confiar en tu experiencia",
  "Dar lo mejor en cada atencion",
  "Cuidar con vocacion",
  "Celebrar cada avance",
  "Resolver juntos los desafios",
  "Trabajar con proposito",
  "La energia que compartes",
  "Tu compromiso con Body Feet"
] as const;

const ENDINGS = [
  "construye un futuro mas saludable.",
  "hace una diferencia real.",
  "inspira confianza en quienes te rodean.",
  "convierte lo cotidiano en algo valioso.",
  "acerca al equipo a una nueva meta.",
  "deja una huella positiva.",
  "fortalece la calidad de nuestro servicio.",
  "abre la puerta a mejores resultados.",
  "transforma desafios en oportunidades.",
  "ayuda a que alguien tenga un mejor dia.",
  "nos recuerda por que elegimos cuidar.",
  "suma bienestar a cada persona.",
  "demuestra que el progreso se logra paso a paso.",
  "da sentido a todo el esfuerzo.",
  "crea una experiencia humana y profesional.",
  "nos impulsa a seguir creciendo.",
  "convierte la excelencia en un habito.",
  "hace que cada logro cuente.",
  "mantiene vivo nuestro proposito.",
  "puede ser el comienzo de algo extraordinario."
] as const;

export const MOTIVATIONAL_QUOTES = OPENINGS.flatMap((opening) =>
  ENDINGS.map((ending) => `${opening} ${ending}`)
);

export const MOTIVATIONAL_QUOTE_INTERVAL_HOURS = 4;
export const MOTIVATIONAL_QUOTE_TIME_ZONE = "America/Lima";

type LimaDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function getLimaDateParts(date: Date): LimaDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOTIVATIONAL_QUOTE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour") };
}

export function getMotivationalQuoteIndex(date = new Date()) {
  const { year, month, day, hour } = getLimaDateParts(date);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  const timeBlock = Math.floor(hour / MOTIVATIONAL_QUOTE_INTERVAL_HOURS);
  return (dayNumber * 6 + timeBlock) % MOTIVATIONAL_QUOTES.length;
}

export function getMotivationalQuote(date = new Date()) {
  return MOTIVATIONAL_QUOTES[getMotivationalQuoteIndex(date)];
}

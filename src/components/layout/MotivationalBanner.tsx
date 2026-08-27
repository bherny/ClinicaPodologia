import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { getMotivationalQuote } from "../../lib/motivationalQuotes";

const REFRESH_INTERVAL_MS = 60_000;

export function MotivationalBanner() {
  const [quote, setQuote] = useState(() => getMotivationalQuote());

  useEffect(() => {
    const refreshQuote = () => setQuote(getMotivationalQuote());
    const interval = window.setInterval(refreshQuote, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshQuote);
    document.addEventListener("visibilitychange", refreshQuote);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshQuote);
      document.removeEventListener("visibilitychange", refreshQuote);
    };
  }, []);

  return (
    <aside className="motivational-banner" aria-label="Frase motivadora del momento">
      <Sparkles aria-hidden="true" />
      <p>{quote}</p>
    </aside>
  );
}

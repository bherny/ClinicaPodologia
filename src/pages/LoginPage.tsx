import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  KeyRound,
  LockKeyhole,
  LogIn,
  Mail,
  Phone,
  ShieldCheck
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { prepareLoginChime } from "../lib/sound";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  clearPatientPortalSession,
  hasPatientPortalSession,
  loginPatientPortal
} from "../services/patientPortal";

type LoginMode = "staff" | "patient";

export function LoginPage() {
  const navigate = useNavigate();
  const { session, profile, loading: authLoading, signIn } = useAuth();
  const [mode, setMode] = useState<LoginMode>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [patientPin, setPatientPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sessionExpired = sessionStorage.getItem("bodyfeet:session-expired") === "1";

  if (!authLoading && session && profile) return <Navigate to={profile.rol === "owner" ? "/owner" : "/"} replace />;
  if (!authLoading && !profile && hasPatientPortalSession()) {
    return <Navigate to="/mi-historial" replace />;
  }

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setError(null);
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="Body Feet">
        <img src="/logo-body-feet-4k.png" alt="Body Feet - Centro de Podologia y Rehabilitacion" />
      </section>

      <section className="login-panel">
        <div className="login-card stack">
          <div>
            <div className="login-icon">{mode === "staff" ? <LockKeyhole /> : <Phone />}</div>
            <p className="eyebrow">Sistema clinico y administrativo</p>
            <h1 className="page-title">Bienvenido a Body Feet</h1>
            <p className="login-subtitle">
              {mode === "staff"
                ? "Ingresa con la cuenta asignada por la clinica."
                : "Consulta tu historial con tu celular y PIN privado."}
            </p>
          </div>

          <div className="login-mode-switch" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "staff"}
              className={mode === "staff" ? "is-active" : ""}
              onClick={() => switchMode("staff")}
            >
              <Mail />
              Personal Body Feet
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "patient"}
              className={mode === "patient" ? "is-active" : ""}
              onClick={() => switchMode("patient")}
            >
              <Phone />
              Soy paciente
            </button>
          </div>

          {!isSupabaseConfigured ? (
            <div className="alert">
              <AlertCircle size={18} />
              Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para conectar el sistema.
            </div>
          ) : null}
          {error ? <div className="alert" role="alert" aria-live="polite">{error}</div> : null}
          {sessionExpired ? (
            <div className="alert alert--info">
              <AlertCircle size={18} />
              Tu sesion vencio por seguridad. Vuelve a ingresar para continuar.
            </div>
          ) : null}

          {mode === "staff" ? (
            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSubmitting(true);
                const finishChime = prepareLoginChime();
                try {
                  clearPatientPortalSession();
                  await signIn(email, password);
                  finishChime(true);
                } catch (nextError) {
                  finishChime(false);
                  setError(nextError instanceof Error ? nextError.message : "No se pudo iniciar sesion.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Field label="Correo">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Contrasena">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" variant="primary" disabled={submitting || !isSupabaseConfigured}>
                <LogIn />
                {submitting ? "Ingresando..." : "Ingresar al sistema"}
              </Button>
            </form>
          ) : (
            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSubmitting(true);
                const finishChime = prepareLoginChime();
                try {
                  await loginPatientPortal(phone, patientPin);
                  finishChime(true);
                  navigate("/mi-historial", { replace: true });
                } catch (nextError) {
                  finishChime(false);
                  setError(nextError instanceof Error ? nextError.message : "No se pudo abrir tu historial.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Field label="Numero de celular">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="999 999 999"
                  autoComplete="tel"
                  required
                />
              </Field>
              <Field label="PIN entregado por Body Feet">
                <Input
                  type="password"
                  inputMode="numeric"
                  voiceMode="off"
                  value={patientPin}
                  onChange={(event) => setPatientPin(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="6 a 10 digitos"
                  autoComplete="current-password"
                  minLength={6}
                  maxLength={10}
                  required
                />
              </Field>
              <p className="login-patient-help">
                Recepcion configura este PIN desde tu ficha. No necesitas recibir mensajes ni pagar por SMS.
              </p>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !isSupabaseConfigured || patientPin.length < 6}
              >
                <KeyRound />
                {submitting ? "Verificando..." : "Ver mi historial"}
              </Button>
            </form>
          )}

          <div className="login-security">
            <ShieldCheck />
            El telefono identifica tu ficha y el PIN privado protege tus datos clinicos.
          </div>
        </div>
      </section>
    </main>
  );
}

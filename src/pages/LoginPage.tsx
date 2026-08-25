import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogIn,
  Phone,
  ShieldCheck,
  UserRound,
  UsersRound
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
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [patientPin, setPatientPin] = useState("");
  const [showPatientPin, setShowPatientPin] = useState(false);
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
        <img
          className="login-hero__photo"
          src="/body-feet-login-clinic.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
        />
        <div className="login-hero__content">
          <div className="login-brand">
            <img src="/favicon.png" alt="" aria-hidden="true" />
            <div>
              <strong>BODY FEET</strong>
              <span>Centro de podologia y rehabilitacion</span>
            </div>
          </div>

          <div className="login-hero__copy">
            <p>Sistema clinico y administrativo</p>
            <h2>Gestion clinica, pacientes y administracion <span>en un solo lugar.</span></h2>
            <div className="login-hero__rule" />
          </div>

          <div className="login-benefits" aria-label="Principios de Body Feet">
            <div><UsersRound /><span>Atencion centrada en el paciente</span></div>
            <div><Activity /><span>Gestion clinica organizada</span></div>
            <div><ShieldCheck /><span>Seguridad y confidencialidad</span></div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__inner">
          <article className="login-card stack">
            <header className="login-card__header">
              <div className="login-icon">{mode === "staff" ? <LockKeyhole /> : <Phone />}</div>
              <p className="eyebrow">Acceso seguro</p>
              <h1>Bienvenido a Body Feet</h1>
              <p className="login-subtitle">
                {mode === "staff"
                  ? "Ingresa con la cuenta asignada por la clinica."
                  : "Consulta tu historial con tu celular y PIN privado."}
              </p>
            </header>

            <div className="login-mode-switch" role="tablist" aria-label="Tipo de acceso">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "staff"}
                className={mode === "staff" ? "is-active" : ""}
                onClick={() => switchMode("staff")}
              >
                <UserRound />
                Personal
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "patient"}
                className={mode === "patient" ? "is-active" : ""}
                onClick={() => switchMode("patient")}
              >
                <Phone />
                Paciente
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
                className="login-form"
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
                    placeholder="correo@bodyfeet.pe"
                    autoComplete="username"
                    required
                  />
                </Field>
                <div className="field">
                  <label htmlFor="staff-password">Contrasena</label>
                  <div className="login-password-control">
                    <input
                      id="staff-password"
                      className="input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      title={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>
                <Button type="submit" variant="primary" disabled={submitting || !isSupabaseConfigured}>
                  <LogIn />
                  {submitting ? "Ingresando..." : "Iniciar sesion"}
                </Button>
              </form>
            ) : (
              <form
                className="login-form"
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
                <div className="field">
                  <label htmlFor="patient-pin">PIN entregado por Body Feet</label>
                  <div className="login-password-control">
                    <input
                      id="patient-pin"
                      className="input"
                      type={showPatientPin ? "text" : "password"}
                      inputMode="numeric"
                      value={patientPin}
                      onChange={(event) => setPatientPin(event.target.value.replace(/D/g, "").slice(0, 10))}
                      placeholder="6 a 10 digitos"
                      autoComplete="current-password"
                      minLength={6}
                      maxLength={10}
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPatientPin ? "Ocultar PIN" : "Mostrar PIN"}
                      title={showPatientPin ? "Ocultar PIN" : "Mostrar PIN"}
                      onClick={() => setShowPatientPin((visible) => !visible)}
                    >
                      {showPatientPin ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>
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
              {mode === "staff"
                ? "Acceso protegido para el personal autorizado."
                : "Tu telefono identifica tu ficha y el PIN protege tus datos clinicos."}
            </div>
          </article>
          <p className="login-footer">Body Feet · Sistema clinico y administrativo</p>
        </div>
      </section>
    </main>
  );
}
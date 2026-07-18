import { useState } from "react";
import { Navigate } from "react-router-dom";
import { AlertCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { prepareLoginChime } from "../lib/sound";
import { isSupabaseConfigured } from "../lib/supabase";

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionExpired = sessionStorage.getItem("bodyfeet:session-expired") === "1";

  if (session) return <Navigate to="/" replace />;

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="Body Feet">
        <img src="/logo-body-feet-4k.png" alt="Body Feet - Centro de Podologia y Rehabilitacion" />
      </section>
      <section className="login-panel">
        <form
          className="login-card stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            const finishChime = prepareLoginChime();
            try {
              await signIn(email, password);
              finishChime(true);
            } catch (nextError) {
              finishChime(false);
              setError(nextError instanceof Error ? nextError.message : "No se pudo iniciar sesion.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <div className="login-icon"><LockKeyhole /></div>
            <p className="eyebrow">Sistema clinico y administrativo</p>
            <h1 className="page-title">Bienvenido a Body Feet</h1>
            <p className="login-subtitle">Ingresa con tu cuenta asignada para continuar.</p>
          </div>
          {!isSupabaseConfigured ? (
            <div className="alert">
              <AlertCircle size={18} />
              Configura las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para conectar el sistema.
            </div>
          ) : null}
          {error ? <div className="alert" role="alert" aria-live="polite">{error}</div> : null}
          {sessionExpired ? (
            <div className="alert alert--info">
              <AlertCircle size={18} />
              Tu sesion vencio por seguridad. Vuelve a ingresar para continuar.
            </div>
          ) : null}
          <Field label="Correo">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </Field>
          <Button type="submit" variant="primary" disabled={loading || !isSupabaseConfigured}>
            <LogIn />
            {loading ? "Ingresando..." : "Ingresar al sistema"}
          </Button>
          <div className="login-security"><ShieldCheck /> Tus datos se transmiten mediante una conexion segura.</div>
        </form>
      </section>
    </main>
  );
}

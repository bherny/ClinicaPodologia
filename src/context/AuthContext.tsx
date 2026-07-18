import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Perfil } from "../types/domain";

type AuthContextValue = {
  session: Session | null;
  profile: Perfil | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!isSupabaseConfigured || !nextSession?.user) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("auth_user_id", nextSession.user.id)
      .eq("activo", true)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError(error.message);
      return;
    }

    if (!data) {
      setProfile(null);
      setProfileError("Tu usuario aun no tiene un perfil activo en Body Feet.");
      return;
    }

    setProfile(data as Perfil);
    setProfileError(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setLoading(false);
    }

    init();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadProfile(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    let handlingExpiration = false;
    const handleExpiredSession = async () => {
      if (handlingExpiration) return;
      handlingExpiration = true;
      sessionStorage.setItem("bodyfeet:session-expired", "1");
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setProfile(null);
      window.location.assign("/login");
    };

    window.addEventListener("bodyfeet:session-expired", handleExpiredSession);
    return () => window.removeEventListener("bodyfeet:session-expired", handleExpiredSession);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("invalid login credentials")) {
        throw new Error("Correo o contraseña incorrectos.");
      }
      if (message.includes("email not confirmed")) {
        throw new Error("Confirma el correo de esta cuenta antes de ingresar.");
      }
      if (message.includes("rate limit")) {
        throw new Error("Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.");
      }
      throw new Error("No se pudo iniciar sesión. Revisa tu conexión e inténtalo nuevamente.");
    }
    sessionStorage.removeItem("bodyfeet:session-expired");
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const value = useMemo(
    () => ({ session, profile, loading, profileError, signIn, signOut, refreshProfile }),
    [session, profile, loading, profileError, signIn, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context and hook live together so consumers share one public module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

function notifyExpiredSession(response: Response) {
  if (response.status === 401 && window.location.pathname !== "/login") {
    window.dispatchEvent(new CustomEvent("bodyfeet:session-expired"));
  }
}

export const isSupabaseConfigured =
  supabaseUrl.startsWith("https://") && supabaseAnonKey.length > 20;

export const supabase = createClient<Database>(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key",
  {
    global: {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        notifyExpiredSession(response);
        return response;
      }
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

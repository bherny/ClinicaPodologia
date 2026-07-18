import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import type { Sede } from "../types/domain";

type BranchContextValue = {
  branches: Sede[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  isAllBranches: boolean;
  canSelectAll: boolean;
  loading: boolean;
};

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { profile, session } = useAuth();
  const [selectedBranchId, setSelectedBranchId] = useState("all");

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    enabled: isSupabaseConfigured && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("sedes").select("*").order("nombre");
      if (error) throw error;
      return (data ?? []) as Sede[];
    }
  });

  const canSelectAll = profile?.rol === "administrador";

  useEffect(() => {
    if (!profile) return;
    if (!canSelectAll) {
      setSelectedBranchId(profile.sede_id ?? "all");
    }
  }, [canSelectAll, profile]);

  const value = useMemo(
    () => ({
      branches: branchesQuery.data ?? [],
      selectedBranchId,
      setSelectedBranchId,
      isAllBranches: selectedBranchId === "all",
      canSelectAll,
      loading: branchesQuery.isLoading
    }),
    [branchesQuery.data, branchesQuery.isLoading, canSelectAll, selectedBranchId]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

// Context and hook live together so consumers share one public module.
// eslint-disable-next-line react-refresh/only-export-components
export function useBranch() {
  const value = useContext(BranchContext);
  if (!value) throw new Error("useBranch debe usarse dentro de BranchProvider");
  return value;
}

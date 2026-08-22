/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

type DraftContextValue = {
  getDraft: <T>(key: string) => T | undefined;
  setDraft: <T>(key: string, value: T) => void;
  clearDraft: (key: string) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Map<string, unknown>());
  const [draftCount, setDraftCount] = useState(0);

  const getDraft = useCallback(<T,>(key: string) => drafts.current.get(key) as T | undefined, []);
  const setDraft = useCallback(<T,>(key: string, value: T) => {
    drafts.current.set(key, value);
    setDraftCount(drafts.current.size);
  }, []);
  const clearDraft = useCallback((key: string) => {
    drafts.current.delete(key);
    setDraftCount(drafts.current.size);
  }, []);

  useEffect(() => {
    if (!draftCount) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draftCount]);

  return <DraftContext.Provider value={{ getDraft, setDraft, clearDraft }}>{children}</DraftContext.Provider>;
}

export function useDraft<T>(key: string, enabled = true) {
  const context = useContext(DraftContext);
  if (!context) throw new Error("useDraft debe usarse dentro de DraftProvider");

  const [draft] = useState<T | undefined>(() => enabled ? context.getDraft<T>(key) : undefined);
  const saveDraft = useCallback((value: T) => {
    if (enabled) context.setDraft(key, value);
  }, [context, enabled, key]);
  const clearDraft = useCallback(() => context.clearDraft(key), [context, key]);

  return { draft, recovered: draft !== undefined, saveDraft, clearDraft };
}
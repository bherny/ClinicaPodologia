// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
const sql = migrationFiles.map((name) => readFileSync(resolve(migrationDirectory, name), "utf8")).join("\n");

describe("Supabase migration safeguards", () => {
  it("enables RLS for every application table", () => {
    const tables = [...sql.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
    expect(tables.length).toBeGreaterThan(10);
    for (const table of new Set(tables)) {
      expect(sql.toLowerCase()).toContain(`alter table public.${table.toLowerCase()} enable row level security`);
    }
  });

  it("pins the search path on every SECURITY DEFINER function", () => {
    const functions = sql.matchAll(/create or replace function[\s\S]*?security definer[\s\S]*?as \$\$/gi);
    let count = 0;
    for (const match of functions) {
      count += 1;
      expect(match[0].toLowerCase()).toContain("set search_path");
    }
    expect(count).toBeGreaterThan(15);
  });

  it("keeps portal credentials private and disables the previous SMS RPC", () => {
    const pinMigration = readFileSync(resolve(migrationDirectory, "202608150002_patient_pin_portal.sql"), "utf8");
    expect(pinMigration).toContain("extensions.crypt(p_pin");
    expect(pinMigration).toContain("revoke all on table public.paciente_portal_accesos");
    expect(pinMigration).toContain("revoke execute on function public.get_my_patient_portal()");
    expect(pinMigration).not.toMatch(/jsonb_build_object\([^)]*p_pin/i);
  });

  it("protects Musa reports without opening the exclusive cash session", () => {
    const reportMigration = readFileSync(resolve(migrationDirectory, "202608150004_musa_report_security.sql"), "utf8");
    expect(reportMigration).toContain("public.current_auth_session_id()");
    expect(reportMigration).toContain("extensions.crypt(coalesce(p_pin, ''), v_config.pin_hash)");
    expect(reportMigration).toContain("public.has_musa_report_access()");
    expect(reportMigration).toContain("public.can_read_financial_sede");
    expect(reportMigration).not.toContain("insert into public.caja_sede_sesiones");
    expect(reportMigration).not.toMatch(/jsonb_build_object\([^)]*p_pin/i);
  });

  it("adds the complete clinical history as structured and indexed data", () => {
    const clinicalMigration = readFileSync(resolve(migrationDirectory, "202608250001_complete_clinical_history.sql"), "utf8");
    expect(clinicalMigration).toContain("add column if not exists fecha_evaluacion date");
    expect(clinicalMigration).toContain("add column if not exists evaluacion jsonb not null");
    expect(clinicalMigration).toContain("jsonb_typeof(evaluacion) = 'object'");
    expect(clinicalMigration).toContain("using gin (evaluacion jsonb_path_ops)");
  });

  it("protects document signatures and internal communication", () => {
    const migration = readFileSync(resolve(migrationDirectory, "202608260001_signatures_and_team_communication.sql"), "utf8");
    expect(migration).toContain("create table if not exists public.firmas_documentos");
    expect(migration).toContain("create table if not exists public.mensajes_internos");
    expect(migration).toContain("create table if not exists public.comunicados");
    expect(migration).toContain("create table if not exists public.comentarios_comunicado");
    expect(migration).toContain("alter table public.firmas_documentos enable row level security");
    expect(migration).toContain("public.can_access_signed_document");
    expect(migration).toContain("save_document_signature");
    expect(migration).toContain("supabase_realtime add table public.mensajes_internos");
    expect(migration).toContain("'team-evidence'");
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });

  it("links message replies and lets every active user soft-delete with audit", () => {
    const migration = readFileSync(resolve(migrationDirectory, "202608260002_internal_message_replies.sql"), "utf8");
    expect(migration).toContain("respuesta_a_id uuid references public.mensajes_internos(id)");
    expect(migration).toContain("Solo puedes responder mensajes del mismo canal");
    expect(migration).toContain("create trigger auditoria_mensajes_internos");
    expect(migration).toContain("create trigger auditoria_comentarios_comunicado");
    expect(migration).toContain("soft_delete_internal_message");
    expect(migration).toContain("soft_delete_community_post");
    expect(migration).toContain("soft_delete_community_comment");
    expect(migration.match(/if not public\.is_active_staff\(\)/g)).toHaveLength(3);
    expect(migration).toContain("grant execute on function public.soft_delete_internal_message(uuid) to authenticated");
  });
});

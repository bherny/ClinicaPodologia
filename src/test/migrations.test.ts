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
});

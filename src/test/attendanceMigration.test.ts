// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608210002_staff_attendance_products.sql"),
  "utf8"
);
const adminSelectionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608210003_admin_staff_selection.sql"),
  "utf8"
);const authProfileMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608210004_sync_auth_profiles.sql"),
  "utf8"
);

describe("Staff attendance migration safeguards", () => {
  it("uses server time, Lima timezone and idempotent request identifiers", () => {
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toContain("America/Lima");
    expect(migration).toContain("entrada_request_id uuid not null unique");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("p_expected_type");
  });

  it("keeps evidence private and outside PostgreSQL", () => {
    expect(migration).toContain("'attendance-evidence', 'attendance-evidence', false");
    expect(migration).toContain("create policy attendance_evidence_read");
    expect(migration).toContain("from storage.objects o");
    expect(migration).toContain("Esta fotografia ya fue utilizada en otra marcacion.");
    expect(migration).not.toContain("createSignedUrl");
    expect(migration).not.toMatch(/base64/i);
  });

  it("allows only administrators, owners or the linked worker to select a professional", () => {
    expect(adminSelectionMigration).toContain("resolve_attendance_professional");
    expect(adminSelectionMigration).toContain("public.is_admin() or p_requested_professional_id = v_current_professional_id");
    expect(adminSelectionMigration).toContain("register_attendance_mark_for");
    expect(adminSelectionMigration).toContain("create policy turnos_admin_manage");
    expect(adminSelectionMigration).not.toMatch(/create table .*profesionales/i);
  });

  it("protects completed evidence from client-side deletion", () => {
    expect(adminSelectionMigration).toContain("and not exists (\n    select 1 from public.jornadas_asistencia j");
    expect(adminSelectionMigration).toContain("j.foto_entrada_path = name or j.foto_salida_path = name");
  });

  it("syncs staff Auth accounts without duplicating profiles or phone-only users", () => {
    expect(authProfileMigration).toContain("after insert on auth.users");
    expect(authProfileMigration).toContain("not exists (");
    expect(authProfileMigration).toContain("where p.auth_user_id = u.id");
    expect(authProfileMigration).toContain("if v_email is null or v_email = ''");
    expect(authProfileMigration).toContain("on conflict do nothing");
    expect(authProfileMigration).not.toContain("service_role");
  });
  it("reuses sales and sale items for products", () => {
    expect(migration).toContain("alter table public.venta_items");
    expect(migration).toContain("producto_id uuid references public.productos");
    expect(migration).toContain("create or replace function public.create_sale");
    expect(migration).not.toMatch(/create table if not exists public\.ventas_productos/i);
  });
});

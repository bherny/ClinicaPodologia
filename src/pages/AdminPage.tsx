import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Edit, KeyRound, LockKeyhole, Palette, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { ROLE_OPTIONS } from "../constants";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { queryClient } from "../lib/queryClient";
import { fullName, money } from "../lib/format";
import { createBranchThemeStyle, DEFAULT_BRANCH_THEME, isValidBranchColor, normalizeBranchTheme } from "../lib/branchTheme";
import { deactivateBranch, deactivateService, softDeleteProfessional, updateBranchTheme, upsertBranch, upsertProfessional, upsertService, updateProfileAdmin } from "../services/admin";
import { changeMusaCashPin, getMusaCashSecurityStatus, lockMusaCashAccess } from "../services/cashSecurity";
import {
  listBranches,
  listProfessionalBranchIds,
  listProfessionalServiceIds,
  listProfessionals,
  listProfiles,
  listServiceBranchIds,
  listServices,
  saveProfessionalBranches,
  saveProfessionalServices,
  saveServiceBranches
} from "../services/catalog";
import type { Perfil, Profesional, RolUsuario, Sede, Servicio } from "../types/domain";

type AdminTab = "sedes" | "servicios" | "profesionales" | "usuarios" | "apariencia" | "seguridad";

export function AdminPage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<AdminTab>(() => {
    const requested = searchParams.get("seccion");
    return ["sedes", "servicios", "profesionales", "usuarios", "apariencia", "seguridad"].includes(requested ?? "")
      ? requested as AdminTab
      : "sedes";
  });
  const [branch, setBranch] = useState<Partial<Sede> | null>(null);
  const [service, setService] = useState<Partial<Servicio> | null>(null);
  const [professional, setProfessional] = useState<Partial<Profesional> | null>(null);
  const [user, setUser] = useState<Partial<Perfil> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const branchesQuery = useQuery({ queryKey: ["admin-branches"], queryFn: () => listBranches(true) });
  const servicesQuery = useQuery({ queryKey: ["admin-services"], queryFn: () => listServices(true) });
  const professionalsQuery = useQuery({ queryKey: ["admin-professionals"], queryFn: () => listProfessionals(true) });
  const profilesQuery = useQuery({ queryKey: ["admin-profiles"], queryFn: listProfiles });
  const deactivateMutation = useMutation({
    mutationFn: async ({ type, id }: { type: "branch" | "service" | "professional"; id: string }) => {
      if (type === "branch") return deactivateBranch(id);
      if (type === "service") return deactivateService(id);
      return softDeleteProfessional(id);
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["admin-professionals"] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["service-options"] });
      queryClient.invalidateQueries({ queryKey: ["professional-options"] });
    },
    onError: (nextError) => setActionError(nextError instanceof Error ? nextError.message : "No se pudo completar la accion")
  });

  if (profile?.rol !== "administrador") {
    return (
      <main className="page">
        <div className="alert">Solo administradores pueden acceder a esta seccion.</div>
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Administracion"
        title="Configuracion operativa"
        description="Gestiona sedes, servicios, profesionales, asignaciones y roles sin escribir valores fijos en el codigo."
      />
      {actionError ? <div className="alert" style={{ marginBottom: 16 }}>{actionError}</div> : null}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          ["sedes", "Sedes"],
          ["servicios", "Servicios"],
          ["profesionales", "Profesionales"],
          ["usuarios", "Usuarios"],
          ["apariencia", "Apariencia"],
          ["seguridad", "Seguridad"]
        ].map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? "tab--active" : ""}`} onClick={() => setTab(id as AdminTab)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "sedes" ? (
        <AdminSection title="Sedes" onCreate={() => setBranch({ activo: true })}>
          {branchesQuery.isLoading ? (
            <TableSkeleton />
          ) : branchesQuery.data?.length ? (
            <SimpleTable
              headers={["Nombre", "Direccion", "Telefono", "Horario", "Estado", "Acciones"]}
              rows={branchesQuery.data.map((item) => [
                item.nombre,
                item.direccion ?? "",
                item.telefono ?? "",
                item.horario ?? "",
                item.activo ? "Activa" : "Inactiva",
                <div className="inline" key="actions"><Button type="button" onClick={() => setBranch(item)} aria-label="Editar sede"><Edit /></Button><Button type="button" variant="danger" disabled={!item.activo} aria-label="Desactivar sede" onClick={() => { if (confirm("¿Desactivar esta sede? Los registros historicos se conservaran.")) deactivateMutation.mutate({ type: "branch", id: item.id }); }}><Trash2 /></Button></div>
              ])}
            />
          ) : (
            <EmptyState title="Sin sedes" />
          )}
        </AdminSection>
      ) : null}

      {tab === "servicios" ? (
        <AdminSection title="Servicios" onCreate={() => setService({ activo: true, duracion_aproximada: 45 })}>
          {servicesQuery.isLoading ? (
            <TableSkeleton />
          ) : servicesQuery.data?.length ? (
            <SimpleTable
              headers={["Nombre", "Duracion", "Precio", "Estado", "Acciones"]}
              rows={servicesQuery.data.map((item) => [
                item.nombre,
                `${item.duracion_aproximada} min`,
                money(item.precio),
                item.activo ? "Activo" : "Inactivo",
                <div className="inline" key="actions"><Button type="button" onClick={() => setService(item)} aria-label="Editar servicio"><Edit /></Button><Button type="button" variant="danger" disabled={!item.activo} aria-label="Desactivar servicio" onClick={() => { if (confirm("¿Desactivar este servicio? Las citas anteriores se conservaran.")) deactivateMutation.mutate({ type: "service", id: item.id }); }}><Trash2 /></Button></div>
              ])}
            />
          ) : (
            <EmptyState title="Sin servicios" />
          )}
        </AdminSection>
      ) : null}

      {tab === "profesionales" ? (
        <AdminSection title="Profesionales" onCreate={() => setProfessional({ activo: true })}>
          {professionalsQuery.isLoading ? (
            <TableSkeleton />
          ) : professionalsQuery.data?.length ? (
            <SimpleTable
              headers={["Nombre", "Especialidad", "Telefono", "Estado", "Acciones"]}
              rows={professionalsQuery.data.map((item) => [
                fullName(item),
                item.especialidad ?? "",
                item.telefono ?? "",
                item.activo ? "Activo" : "Inactivo",
                <div className="inline" key="actions"><Button type="button" onClick={() => setProfessional(item)} aria-label="Editar profesional"><Edit /></Button><Button type="button" variant="danger" disabled={!item.activo} aria-label="Desactivar profesional" onClick={() => { if (confirm("¿Desactivar este profesional? Sus citas e historias anteriores se conservaran.")) deactivateMutation.mutate({ type: "professional", id: item.id }); }}><Trash2 /></Button></div>
              ])}
            />
          ) : (
            <EmptyState title="Sin profesionales" />
          )}
        </AdminSection>
      ) : null}

      {tab === "usuarios" ? (
        <AdminSection title="Usuarios" onCreate={undefined}>
          <div className="alert alert--info" style={{ marginBottom: 14 }}>
            Crea el usuario en Supabase Auth y luego asigna rol y sede desde esta tabla de perfiles.
          </div>
          {profilesQuery.isLoading ? (
            <TableSkeleton />
          ) : profilesQuery.data?.length ? (
            <SimpleTable
              headers={["Usuario", "Correo", "Rol", "Sede", "Estado", "Acciones"]}
              rows={profilesQuery.data.map((item) => [
                fullName(item),
                item.correo,
                item.rol,
                item.sede?.nombre ?? "Todas",
                item.activo ? "Activo" : "Inactivo",
                <Button key="edit" type="button" onClick={() => setUser(item)} aria-label="Editar usuario">
                  <Edit />
                </Button>
              ])}
            />
          ) : (
            <EmptyState title="Sin perfiles" />
          )}
        </AdminSection>
      ) : null}

      {tab === "apariencia" ? <BranchAppearanceAdmin branches={branchesQuery.data ?? []} isLoading={branchesQuery.isLoading} /> : null}

      {tab === "seguridad" ? <MusaCashSecurityAdmin /> : null}

      {branch ? <BranchModal branch={branch} onClose={() => setBranch(null)} /> : null}
      {service ? <ServiceModal service={service} branches={branchesQuery.data ?? []} onClose={() => setService(null)} /> : null}
      {professional ? (
        <ProfessionalModal
          professional={professional}
          branches={branchesQuery.data ?? []}
          services={servicesQuery.data ?? []}
          profiles={profilesQuery.data ?? []}
          onClose={() => setProfessional(null)}
        />
      ) : null}
      {user ? <UserModal profile={user} branches={branchesQuery.data ?? []} onClose={() => setUser(null)} /> : null}
    </main>
  );
}

const BRANCH_THEME_PRESETS = [
  { name: "Body Feet", color_sidebar: "#0B455C", color_primario: "#19A79C", color_acento: "#5E92DB" },
  { name: "Cielo", color_sidebar: "#315470", color_primario: "#5E92DB", color_acento: "#99D6E9" },
  { name: "Lila clinico", color_sidebar: "#3E4D68", color_primario: "#7B67A8", color_acento: "#CAA2DE" }
] as const;

function BranchAppearanceAdmin({ branches, isLoading }: { branches: Sede[]; isLoading: boolean }) {
  const [branchId, setBranchId] = useState("");
  const [theme, setTheme] = useState(() => normalizeBranchTheme(DEFAULT_BRANCH_THEME));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedBranch = branches.find((branch) => branch.id === branchId);

  useEffect(() => {
    if (branches.length && !branches.some((branch) => branch.id === branchId)) setBranchId(branches[0].id);
  }, [branchId, branches]);

  useEffect(() => {
    if (!selectedBranch) return;
    setTheme(normalizeBranchTheme(selectedBranch));
    setMessage(null);
    setError(null);
  }, [selectedBranch]);

  const mutation = useMutation({
    mutationFn: () => updateBranchTheme(branchId, theme),
    onSuccess: () => {
      setError(null);
      setMessage("Apariencia guardada. Se aplicara al seleccionar esta sede.");
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (nextError) => {
      setMessage(null);
      setError(nextError instanceof Error ? nextError.message : "No se pudo guardar la apariencia.");
    }
  });

  const saveTheme = () => {
    if (!branchId) return;
    if (![theme.color_sidebar, theme.color_primario, theme.color_acento].every(isValidBranchColor)) {
      setError("Los tres colores deben usar el formato hexadecimal #RRGGBB.");
      return;
    }
    mutation.mutate();
  };

  if (isLoading) return <Card title="Identidad visual por sede"><TableSkeleton rows={4} /></Card>;
  if (!branches.length) return <Card><EmptyState title="No hay sedes disponibles" /></Card>;

  return (
    <Card title="Identidad visual por sede">
      <div className="appearance-settings">
        <section className="appearance-settings__controls">
          <div className="appearance-settings__intro">
            <Palette aria-hidden="true" />
            <div>
              <h3>Personaliza sin perder legibilidad</h3>
              <p>Los colores se guardan en Supabase y se aplican cuando un usuario trabaja en esa sede.</p>
            </div>
          </div>
          <Field label="Sede a personalizar">
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
            </Select>
          </Field>
          <div className="theme-presets" aria-label="Paletas sugeridas">
            {BRANCH_THEME_PRESETS.map((preset) => (
              <button key={preset.name} type="button" onClick={() => setTheme(normalizeBranchTheme(preset))}>
                <span className="theme-preset__swatches" aria-hidden="true">
                  <i style={{ background: preset.color_sidebar }} />
                  <i style={{ background: preset.color_primario }} />
                  <i style={{ background: preset.color_acento }} />
                </span>
                {preset.name}
              </button>
            ))}
          </div>
          <div className="theme-color-grid">
            <ThemeColorControl label="Barra lateral" value={theme.color_sidebar} fallback={DEFAULT_BRANCH_THEME.color_sidebar} onChange={(color) => setTheme((current) => ({ ...current, color_sidebar: color }))} />
            <ThemeColorControl label="Acciones principales" value={theme.color_primario} fallback={DEFAULT_BRANCH_THEME.color_primario} onChange={(color) => setTheme((current) => ({ ...current, color_primario: color }))} />
            <ThemeColorControl label="Acentos" value={theme.color_acento} fallback={DEFAULT_BRANCH_THEME.color_acento} onChange={(color) => setTheme((current) => ({ ...current, color_acento: color }))} />
          </div>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          {message ? <div className="alert alert--success">{message}</div> : null}
          <div className="inline">
            <Button type="button" variant="primary" disabled={mutation.isPending} onClick={saveTheme}><Save /> {mutation.isPending ? "Guardando..." : "Guardar apariencia"}</Button>
            <Button type="button" onClick={() => setTheme(normalizeBranchTheme(DEFAULT_BRANCH_THEME))}><RotateCcw /> Restablecer</Button>
          </div>
        </section>
        <section className="theme-preview" style={createBranchThemeStyle(theme)} aria-label="Vista previa de apariencia">
          <div className="theme-preview__sidebar">
            <span className="theme-preview__logo">BF</span>
            <span className="theme-preview__nav theme-preview__nav--active">Inicio</span>
            <span className="theme-preview__nav">Pacientes</span>
            <span className="theme-preview__nav">Citas</span>
          </div>
          <div className="theme-preview__content">
            <span className="eyebrow">Vista previa</span>
            <strong>{selectedBranch?.nombre ?? "Sede"}</strong>
            <div className="theme-preview__metrics"><i /><i /><i /></div>
            <span className="theme-preview__button">Accion principal</span>
          </div>
        </section>
      </div>
    </Card>
  );
}

function ThemeColorControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  const pickerValue = isValidBranchColor(value) ? value : fallback;
  return (
    <label className="theme-color-control">
      <span>{label}</span>
      <span className="theme-color-control__inputs">
        <input type="color" value={pickerValue} onChange={(event) => onChange(event.target.value.toUpperCase())} aria-label={`Elegir ${label.toLowerCase()}`} />
        <Input voiceMode="off" value={value} maxLength={7} onChange={(event) => onChange(event.target.value.toUpperCase())} aria-label={`Codigo de color para ${label.toLowerCase()}`} />
      </span>
    </label>
  );
}
function MusaCashSecurityAdmin() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["musa-cash-security"],
    queryFn: getMusaCashSecurityStatus,
    retry: false
  });
  const mutation = useMutation({
    mutationFn: () => changeMusaCashPin(currentPin, newPin),
    onSuccess: (result) => {
      if (!result.exito) {
        setMessage(null);
        setError(result.mensaje);
        queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
        return;
      }
      setCurrentPin("");
      setNewPin("");
      setConfirmation("");
      setError(null);
      setMessage(result.mensaje);
      queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (nextError) => {
      setMessage(null);
      setError(nextError instanceof Error ? nextError.message : "No se pudo cambiar el PIN.");
    }
  });
  const lockMutation = useMutation({
    mutationFn: lockMusaCashAccess,
    onSuccess: () => {
      setMessage("Caja Musa quedo bloqueada para tu sesion.");
      queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo bloquear Caja Musa.")
  });

  const savePin = () => {
    setMessage(null);
    setError(null);
    if (!/^\d{4,8}$/.test(newPin)) {
      setError("El nuevo PIN debe contener entre 4 y 8 digitos.");
      return;
    }
    if (newPin !== confirmation) {
      setError("La confirmacion no coincide con el nuevo PIN.");
      return;
    }
    if (statusQuery.data?.configurado && !/^\d{4,8}$/.test(currentPin)) {
      setError("Ingresa el PIN actual para autorizar el cambio.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Card title="Seguridad de Caja Musa">
      {statusQuery.isLoading ? <TableSkeleton rows={3} /> : statusQuery.error ? (
        <div className="alert">{statusQuery.error instanceof Error ? statusQuery.error.message : "No se pudo cargar la configuracion de seguridad."}</div>
      ) : (
        <div className="security-settings">
          <section className="security-settings__summary">
            <div className="security-settings__icon"><ShieldCheck aria-hidden="true" /></div>
            <div>
              <h3>Proteccion financiera adicional</h3>
              <p>El PIN se valida en Supabase, se almacena mediante hash y nunca se muestra en esta aplicacion.</p>
              <span className={`status-badge ${statusQuery.data?.configurado ? "status-badge--confirmed" : "status-badge--pending"}`}>
                {statusQuery.data?.configurado ? "PIN configurado" : "Configuracion pendiente"}
              </span>
            </div>
          </section>

          <section className="security-settings__form" aria-label="Configurar PIN de Caja Musa">
            <h3>{statusQuery.data?.configurado ? "Cambiar PIN" : "Configurar primer PIN"}</h3>
            {statusQuery.data?.configurado ? (
              <Field label="PIN actual"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ""))} /></Field>
            ) : null}
            <div className="form-grid">
              <Field label="Nuevo PIN"><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} /></Field>
              <Field label="Confirmar PIN"><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ""))} /></Field>
            </div>
            <p className="muted">Usa entre 4 y 8 digitos. Al cambiarlo se cierran todas las autorizaciones activas de Musa.</p>
            {error ? <div className="alert" role="alert">{error}</div> : null}
            {message ? <div className="alert alert--success">{message}</div> : null}
            <div className="inline">
              <Button type="button" variant="primary" disabled={mutation.isPending} onClick={savePin}><KeyRound /> {mutation.isPending ? "Guardando..." : statusQuery.data?.configurado ? "Cambiar PIN" : "Configurar PIN"}</Button>
              {statusQuery.data?.autorizado ? <Button type="button" disabled={lockMutation.isPending} onClick={() => lockMutation.mutate()}><LockKeyhole /> Bloquear mi acceso</Button> : null}
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}
function AdminSection({ title, onCreate, children }: { title: string; onCreate?: () => void; children: React.ReactNode }) {
  return (
    <Card
      title={title}
      action={
        onCreate ? (
          <Button type="button" variant="primary" onClick={onCreate}>
            <Plus />
            Nuevo
          </Button>
        ) : null
      }
    >
      {children}
    </Card>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchModal({ branch, onClose }: { branch: Partial<Sede>; onClose: () => void }) {
  const [values, setValues] = useState(branch);
  const mutation = useMutation({
    mutationFn: () => upsertBranch(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      onClose();
    }
  });
  return (
    <Modal title={branch.id ? "Editar sede" : "Nueva sede"} onClose={onClose} footer={<SaveFooter onClose={onClose} onSave={() => mutation.mutate()} />}>
      <div className="form-grid">
        <Field label="Nombre"><Input value={values.nombre ?? ""} onChange={(e) => setValues({ ...values, nombre: e.target.value })} /></Field>
        <Field label="Telefono"><Input value={values.telefono ?? ""} onChange={(e) => setValues({ ...values, telefono: e.target.value })} /></Field>
        <Field label="Direccion"><Input value={values.direccion ?? ""} onChange={(e) => setValues({ ...values, direccion: e.target.value })} /></Field>
        <Field label="Horario"><Input value={values.horario ?? ""} onChange={(e) => setValues({ ...values, horario: e.target.value })} /></Field>
        <Field label="Responsable"><Input value={values.responsable_sede ?? ""} onChange={(e) => setValues({ ...values, responsable_sede: e.target.value })} /></Field>
        <Field label="Estado">
          <Select value={values.activo ? "true" : "false"} onChange={(e) => setValues({ ...values, activo: e.target.value === "true" })}>
            <option value="true">Activa</option>
            <option value="false">Inactiva</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ServiceModal({ service, branches, onClose }: { service: Partial<Servicio>; branches: Sede[]; onClose: () => void }) {
  const [values, setValues] = useState(service);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  useEffect(() => {
    if (service.id) listServiceBranchIds(service.id).then(setBranchIds);
    else setBranchIds(branches.map((branch) => branch.id));
  }, [branches, service.id]);
  const mutation = useMutation({
    mutationFn: async () => {
      const saved = await upsertService(values);
      await saveServiceBranches(saved.id, branchIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["service-options"] });
      onClose();
    }
  });
  return (
    <Modal title={service.id ? "Editar servicio" : "Nuevo servicio"} onClose={onClose} footer={<SaveFooter onClose={onClose} onSave={() => mutation.mutate()} />}>
      <div className="form-grid">
        <Field label="Nombre"><Input value={values.nombre ?? ""} onChange={(e) => setValues({ ...values, nombre: e.target.value })} /></Field>
        <Field label="Duracion aproximada"><Input type="number" value={values.duracion_aproximada ?? 45} onChange={(e) => setValues({ ...values, duracion_aproximada: Number(e.target.value) })} /></Field>
        <Field label="Precio"><Input type="number" value={values.precio ?? ""} onChange={(e) => setValues({ ...values, precio: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="Estado">
          <Select value={values.activo ? "true" : "false"} onChange={(e) => setValues({ ...values, activo: e.target.value === "true" })}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Select>
        </Field>
        <div className="field span-2">
          <label>Descripcion</label>
          <Textarea value={values.descripcion ?? ""} onChange={(e) => setValues({ ...values, descripcion: e.target.value })} />
        </div>
        <CheckList title="Sedes donde se ofrece" items={branches} selected={branchIds} setSelected={setBranchIds} />
      </div>
    </Modal>
  );
}

function ProfessionalModal({
  professional,
  branches,
  services,
  profiles,
  onClose
}: {
  professional: Partial<Profesional>;
  branches: Sede[];
  services: Servicio[];
  profiles: Perfil[];
  onClose: () => void;
}) {
  const [values, setValues] = useState(professional);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [horario, setHorario] = useState("");
  useEffect(() => {
    if (professional.id) {
      listProfessionalBranchIds(professional.id).then(setBranchIds);
      listProfessionalServiceIds(professional.id).then(setServiceIds);
    }
  }, [professional.id]);
  const mutation = useMutation({
    mutationFn: async () => {
      const saved = await upsertProfessional(values);
      await saveProfessionalBranches(saved.id, branchIds, horario);
      await saveProfessionalServices(saved.id, serviceIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-professionals"] });
      queryClient.invalidateQueries({ queryKey: ["professional-options"] });
      onClose();
    }
  });
  return (
    <Modal title={professional.id ? "Editar profesional" : "Nuevo profesional"} onClose={onClose} footer={<SaveFooter onClose={onClose} onSave={() => mutation.mutate()} />}>
      <div className="form-grid">
        <Field label="Nombres"><Input value={values.nombres ?? ""} onChange={(e) => setValues({ ...values, nombres: e.target.value })} /></Field>
        <Field label="Apellidos"><Input value={values.apellidos ?? ""} onChange={(e) => setValues({ ...values, apellidos: e.target.value })} /></Field>
        <Field label="Especialidad"><Input value={values.especialidad ?? ""} onChange={(e) => setValues({ ...values, especialidad: e.target.value })} /></Field>
        <Field label="Telefono"><Input value={values.telefono ?? ""} onChange={(e) => setValues({ ...values, telefono: e.target.value })} /></Field>
        <Field label="Usuario vinculado">
          <Select value={values.usuario_id ?? ""} onChange={(e) => setValues({ ...values, usuario_id: e.target.value || null })}>
            <option value="">Sin vincular</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {fullName(profile)} · {profile.correo}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={values.activo ? "true" : "false"} onChange={(e) => setValues({ ...values, activo: e.target.value === "true" })}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Select>
        </Field>
        <Field label="Horario disponible"><Input value={horario} onChange={(e) => setHorario(e.target.value)} /></Field>
        <CheckList title="Sedes asignadas" items={branches} selected={branchIds} setSelected={setBranchIds} />
        <CheckList title="Servicios asociados" items={services} selected={serviceIds} setSelected={setServiceIds} />
      </div>
    </Modal>
  );
}

function UserModal({ profile, branches, onClose }: { profile: Partial<Perfil>; branches: Sede[]; onClose: () => void }) {
  const [values, setValues] = useState(profile);
  const mutation = useMutation({
    mutationFn: () => updateProfileAdmin(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      onClose();
    }
  });
  return (
    <Modal title="Editar usuario" onClose={onClose} footer={<SaveFooter onClose={onClose} onSave={() => mutation.mutate()} />}>
      <div className="form-grid">
        <Field label="Nombres"><Input value={values.nombres ?? ""} onChange={(e) => setValues({ ...values, nombres: e.target.value })} /></Field>
        <Field label="Apellidos"><Input value={values.apellidos ?? ""} onChange={(e) => setValues({ ...values, apellidos: e.target.value })} /></Field>
        <Field label="Telefono"><Input value={values.telefono ?? ""} onChange={(e) => setValues({ ...values, telefono: e.target.value })} /></Field>
        <Field label="Rol">
          <Select value={values.rol ?? "recepcion"} onChange={(e) => setValues({ ...values, rol: e.target.value as RolUsuario })}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sede principal">
          <Select value={values.sede_id ?? ""} onChange={(e) => setValues({ ...values, sede_id: e.target.value || null })}>
            <option value="">Todas o sin sede</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={values.activo ? "true" : "false"} onChange={(e) => setValues({ ...values, activo: e.target.value === "true" })}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function CheckList({
  title,
  items,
  selected,
  setSelected
}: {
  title: string;
  items: Array<{ id: string; nombre: string }>;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  return (
    <div className="field span-2">
      <label>{title}</label>
      <div className="inline">
        {items.map((item) => (
          <label key={item.id} className="button" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) => {
                setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id));
              }}
            />
            {item.nombre}
          </label>
        ))}
      </div>
    </div>
  );
}

function SaveFooter({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  return (
    <>
      <Button type="button" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="button" variant="primary" onClick={onSave}>
        Guardar
      </Button>
    </>
  );
}

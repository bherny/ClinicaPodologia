import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
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
import { deactivateBranch, deactivateService, softDeleteProfessional, upsertBranch, upsertProfessional, upsertService, updateProfileAdmin } from "../services/admin";
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

type AdminTab = "sedes" | "servicios" | "profesionales" | "usuarios";

export function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<AdminTab>("sedes");
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
          ["usuarios", "Usuarios"]
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

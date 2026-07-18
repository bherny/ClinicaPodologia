import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useBranch } from "../context/BranchContext";
import { fullName } from "../lib/format";
import { toReadableDate } from "../lib/date";
import { queryClient } from "../lib/queryClient";
import {
  clinicalHistorySchema,
  createClinicalHistory,
  listClinicalHistory,
  softDeleteClinicalHistory,
  type ClinicalHistoryFormValues
} from "../services/history";
import { listPatients } from "../services/patients";
import { listProfessionals } from "../services/catalog";

export function ClinicalHistoryPage() {
  const { selectedBranchId } = useBranch();
  const [open, setOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: ["clinical-history", selectedBranchId],
    queryFn: () => listClinicalHistory(selectedBranchId)
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteClinicalHistory,
    onSuccess: () => {
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["patient-history"] });
    },
    onError: (nextError) => {
      setDeleteError(nextError instanceof Error ? nextError.message : "No se pudo eliminar la historia clinica");
    }
  });

  const rows = historyQuery.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Historias clinicas"
        title="Registro clinico historico"
        description="Cada atencion conserva diagnostico, tratamiento, evolucion y recomendaciones sin sobrescribir registros previos."
        action={
          <Button type="button" variant="primary" onClick={() => setOpen(true)}>
            <Plus />
            Nueva historia
          </Button>
        }
      />

      {deleteError ? <div className="alert" style={{ marginBottom: 14 }}>{deleteError}</div> : null}

      <Card>
        {historyQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Diagnostico</th>
                  <th>Tratamiento realizado</th>
                  <th>Profesional</th>
                  <th>Sede</th>
                  <th>Proxima fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Fecha">{toReadableDate((item.cita?.fecha ?? item.created_at).slice(0, 10))}</td>
                    <td data-label="Paciente">
                      <strong>{fullName(item.paciente)}</strong>
                    </td>
                    <td data-label="Diagnostico">{item.diagnostico}</td>
                    <td data-label="Tratamiento">{item.tratamiento_realizado}</td>
                    <td data-label="Profesional">{fullName(item.profesional)}</td>
                    <td data-label="Sede">{item.sede?.nombre}</td>
                    <td data-label="Proxima fecha">{item.proxima_fecha_sugerida ? toReadableDate(item.proxima_fecha_sugerida) : "Sin sugerencia"}</td>
                    <td data-label="Acciones">
                      <Button
                        type="button"
                        variant="danger"
                        aria-label="Eliminar historia clinica"
                        onClick={() => {
                          if (confirm("¿Eliminar logicamente esta historia clinica?")) deleteMutation.mutate(item.id);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Aun no hay historias clinicas" />
        )}
      </Card>

      {open ? <ClinicalHistoryModal onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

function ClinicalHistoryModal({ onClose }: { onClose: () => void }) {
  const { selectedBranchId, branches } = useBranch();
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({ queryKey: ["history-patients"], queryFn: () => listPatients({ pageSize: 300 }) });
  const professionalsQuery = useQuery({ queryKey: ["history-professionals"], queryFn: () => listProfessionals() });
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<ClinicalHistoryFormValues>({
    resolver: zodResolver(clinicalHistorySchema),
    defaultValues: {
      paciente_id: "",
      cita_id: null,
      sede_id: selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id ?? "",
      profesional_id: null,
      diagnostico: "",
      tratamiento_realizado: "",
      evolucion: "",
      recomendaciones: "",
      proxima_fecha_sugerida: ""
    }
  });

  const mutation = useMutation({
    mutationFn: createClinicalHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["patient-history"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar la historia clinica")
  });

  return (
    <Modal
      title="Nueva historia clinica"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="history-form" type="submit" variant="primary" disabled={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="history-form" className="form-grid" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        {error ? <div className="alert span-2">{error}</div> : null}
        <Field label="Paciente" error={errors.paciente_id?.message}>
          <Select {...register("paciente_id")}>
            <option value="">Seleccionar</option>
            {(patientsQuery.data?.data ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {fullName(patient)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sede" error={errors.sede_id?.message}>
          <Select {...register("sede_id")}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profesional">
          <Select {...register("profesional_id")}>
            <option value="">Sin asignar</option>
            {(professionalsQuery.data ?? []).map((professional) => (
              <option key={professional.id} value={professional.id}>
                {fullName(professional)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proxima fecha sugerida">
          <Input type="date" {...register("proxima_fecha_sugerida")} />
        </Field>
        <div className="field span-2">
          <label>Diagnostico</label>
          <Textarea {...register("diagnostico")} />
          {errors.diagnostico ? <span className="field-error">{errors.diagnostico.message}</span> : null}
        </div>
        <div className="field span-2">
          <label>Tratamiento realizado</label>
          <Textarea {...register("tratamiento_realizado")} />
          {errors.tratamiento_realizado ? <span className="field-error">{errors.tratamiento_realizado.message}</span> : null}
        </div>
        <div className="field span-2">
          <label>Evolucion</label>
          <Textarea {...register("evolucion")} />
        </div>
        <div className="field span-2">
          <label>Recomendaciones</label>
          <Textarea {...register("recomendaciones")} />
        </div>
      </form>
    </Modal>
  );
}

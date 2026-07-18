import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FilePlus2, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useBranch } from "../context/BranchContext";
import { useAuth } from "../context/AuthContext";
import { todayISO, toReadableDate } from "../lib/date";
import { fullName } from "../lib/format";
import { printPrescription } from "../lib/print";
import { queryClient } from "../lib/queryClient";
import { listProfessionals } from "../services/catalog";
import { listPatients } from "../services/patients";
import {
  createPrescription,
  listPrescriptions,
  prescriptionSchema,
  softDeletePrescription,
  type PrescriptionFormValues
} from "../services/prescriptions";

export function PrescriptionsPage() {
  const { selectedBranchId, branches } = useBranch();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prescriptionsQuery = useQuery({
    queryKey: ["prescriptions", selectedBranchId],
    queryFn: () => listPrescriptions(selectedBranchId)
  });

  const deleteMutation = useMutation({
    mutationFn: softDeletePrescription,
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["patient-prescriptions"] });
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo eliminar la receta")
  });

  const rows = prescriptionsQuery.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Documentos clinicos"
        title="Recetas e indicaciones"
        description="Emite, conserva e imprime recetas vinculadas al paciente, profesional y sede donde fue atendido."
        action={
          <Button type="button" variant="primary" onClick={() => setOpen(true)}>
            <FilePlus2 />
            Nueva receta
          </Button>
        }
      />

      {error ? <div className="alert" style={{ marginBottom: 14 }}>{error}</div> : null}
      {prescriptionsQuery.error ? (
        <div className="alert" style={{ marginBottom: 14 }}>
          {prescriptionsQuery.error instanceof Error ? prescriptionsQuery.error.message : "No se pudieron cargar las recetas"}
        </div>
      ) : null}

      <Card>
        {prescriptionsQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Diagnostico</th>
                  <th>Medicamentos</th>
                  <th>Profesional</th>
                  <th>Sede</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((prescription) => (
                  <tr key={prescription.id}>
                    <td data-label="Fecha"><strong>{toReadableDate(prescription.fecha)}</strong></td>
                    <td data-label="Paciente">
                      <strong>{fullName(prescription.paciente)}</strong>
                      <div className="muted">{prescription.paciente?.telefono}</div>
                    </td>
                    <td data-label="Diagnostico">{prescription.diagnostico ?? "Sin registrar"}</td>
                    <td data-label="Medicamentos">{prescription.items.length} registro(s)</td>
                    <td data-label="Profesional">{fullName(prescription.profesional)}</td>
                    <td data-label="Sede">{prescription.sede?.nombre}</td>
                    <td data-label="Acciones">
                      <div className="inline">
                        <Button type="button" aria-label="Imprimir receta" onClick={() => printPrescription(prescription)}>
                          <Printer />
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          aria-label="Eliminar receta"
                          onClick={() => {
                            if (confirm("¿Eliminar logicamente esta receta?")) deleteMutation.mutate(prescription.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Aun no hay recetas registradas" description="Las recetas emitidas quedaran disponibles para reimpresion." />
        )}
      </Card>

      {open ? (
        <PrescriptionModal
          branches={branches}
          defaultBranchId={selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id ?? ""}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}

function PrescriptionModal({
  branches,
  defaultBranchId,
  onClose
}: {
  branches: Array<{ id: string; nombre: string }>;
  defaultBranchId: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({ queryKey: ["prescription-patients"], queryFn: () => listPatients({ pageSize: 300 }) });
  const professionalsQuery = useQuery({ queryKey: ["prescription-professionals"], queryFn: () => listProfessionals() });
  const availableProfessionals = (professionalsQuery.data ?? []).filter(
    (professional) => profile?.rol !== "profesional" || professional.usuario_id === profile.id
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      paciente_id: "",
      sede_id: defaultBranchId,
      profesional_id: "",
      fecha: todayISO(),
      diagnostico: "",
      indicaciones_generales: "",
      items: [{ medicamento: "", dosis: "", frecuencia: "", duracion: "", via: "", indicaciones: "" }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const mutation = useMutation({
    mutationFn: createPrescription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["patient-prescriptions"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo emitir la receta")
  });

  return (
    <Modal
      title="Nueva receta"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button form="prescription-form" type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando..." : "Guardar receta"}
          </Button>
        </>
      }
    >
      <form id="prescription-form" className="stack" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        {error ? <div className="alert">{error}</div> : null}
        <div className="form-grid form-grid--three">
          <Field label="Paciente" error={errors.paciente_id?.message}>
            <Select {...register("paciente_id")}>
              <option value="">Seleccionar paciente</option>
              {(patientsQuery.data?.data ?? []).map((patient) => (
                <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.telefono}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sede" error={errors.sede_id?.message}>
            <Select {...register("sede_id")}>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha" error={errors.fecha?.message}>
            <Input type="date" {...register("fecha")} />
          </Field>
          <Field label="Profesional" error={errors.profesional_id?.message}>
            <Select {...register("profesional_id")}>
              <option value="">Seleccionar profesional</option>
              {availableProfessionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{fullName(professional)}</option>
              ))}
            </Select>
          </Field>
          <div className="field span-2">
            <label>Diagnostico o motivo</label>
            <Input {...register("diagnostico")} placeholder="Opcional" />
          </div>
        </div>

        <div className="prescription-items">
          <div className="section-heading">
            <div>
              <h3>Medicamentos e indicaciones</h3>
              <p>Registra cada producto o recomendacion en una linea separada.</p>
            </div>
            <Button
              type="button"
              onClick={() => append({ medicamento: "", dosis: "", frecuencia: "", duracion: "", via: "", indicaciones: "" })}
            >
              <Plus /> Agregar linea
            </Button>
          </div>

          {fields.map((field, index) => (
            <section className="prescription-item" key={field.id}>
              <div className="prescription-item__header">
                <strong>Indicacion {index + 1}</strong>
                <Button type="button" variant="ghost" aria-label={`Quitar indicacion ${index + 1}`} disabled={fields.length === 1} onClick={() => remove(index)}>
                  <Trash2 />
                </Button>
              </div>
              <div className="form-grid form-grid--three">
                <Field label="Medicamento o tratamiento" error={errors.items?.[index]?.medicamento?.message}>
                  <Input {...register(`items.${index}.medicamento`)} placeholder="Ej. Ibuprofeno 400 mg" />
                </Field>
                <Field label="Dosis"><Input {...register(`items.${index}.dosis`)} placeholder="Ej. 1 tableta" /></Field>
                <Field label="Frecuencia"><Input {...register(`items.${index}.frecuencia`)} placeholder="Ej. cada 8 horas" /></Field>
                <Field label="Duracion"><Input {...register(`items.${index}.duracion`)} placeholder="Ej. por 5 dias" /></Field>
                <Field label="Via"><Input {...register(`items.${index}.via`)} placeholder="Ej. via oral" /></Field>
                <Field label="Indicacion especifica"><Input {...register(`items.${index}.indicaciones`)} placeholder="Ej. despues de los alimentos" /></Field>
              </div>
            </section>
          ))}
          {errors.items?.root?.message ? <span className="field-error">{errors.items.root.message}</span> : null}
        </div>

        <Field label="Indicaciones generales">
          <Textarea {...register("indicaciones_generales")} placeholder="Cuidados, controles o recomendaciones adicionales" />
        </Field>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Edit, Eye, FilePlus2, FileText, MessageCircle, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { todayISO, toReadableDate, toReadableDateLong } from "../lib/date";
import { fullName } from "../lib/format";
import { downloadPrescriptionPdf } from "../lib/prescriptionPdf";
import { printPrescription } from "../lib/print";
import { queryClient } from "../lib/queryClient";
import { buildPrescriptionShareMessage, buildWhatsAppUrl, hasValidWhatsAppPhone } from "../lib/whatsapp";
import { listProfessionals } from "../services/catalog";
import { listPatients } from "../services/patients";
import {
  createPrescription,
  listPrescriptions,
  prescriptionSchema,
  recordPrescriptionDocumentAction,
  softDeletePrescription,
  updatePrescription,
  type PrescriptionFormValues
} from "../services/prescriptions";
import type { RecetaDetalle } from "../types/domain";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PrescriptionsPage() {
  const { selectedBranchId, branches } = useBranch();
  const { profile } = useAuth();
  const [editing, setEditing] = useState<RecetaDetalle | "new" | null>(null);
  const [viewing, setViewing] = useState<RecetaDetalle | null>(null);
  const [sharing, setSharing] = useState<RecetaDetalle | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const prescriptionsQuery = useQuery({
    queryKey: ["prescriptions", selectedBranchId],
    queryFn: () => listPrescriptions(selectedBranchId),
    enabled: profile?.rol !== "recepcion"
  });

  const deleteMutation = useMutation({
    mutationFn: softDeletePrescription,
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["patient-prescriptions"] });
    },
    onError: (nextError) => setActionError(getErrorMessage(nextError, "No se pudo eliminar la receta"))
  });

  const handleDownload = async (prescription: RecetaDetalle) => {
    setActionError(null);
    setActionMessage(null);
    setDocumentBusyId(prescription.id);
    try {
      const fileName = await downloadPrescriptionPdf(prescription);
      try {
        await recordPrescriptionDocumentAction(prescription.id, "descarga_pdf", { file_name: fileName });
        setActionMessage("PDF descargado y registrado en auditoria.");
      } catch (auditError) {
        setActionError(`El PDF se descargo correctamente, pero no se registro en auditoria. ${getErrorMessage(auditError, "")}`);
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "No se pudo generar el PDF de la receta."));
    } finally {
      setDocumentBusyId(null);
    }
  };

  if (profile?.rol === "recepcion") {
    return (
      <main className="page">
        <div className="alert">Tu rol no tiene acceso a recetas ni documentos clinicos privados.</div>
      </main>
    );
  }

  const rows = prescriptionsQuery.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Documentos clinicos"
        title="Recetas e indicaciones"
        description="Emite, edita y comparte recetas vinculadas al paciente, profesional y sede donde fue atendido."
        action={
          <Button type="button" variant="primary" onClick={() => setEditing("new")}>
            <FilePlus2 />
            Nueva receta
          </Button>
        }
      />

      {actionError ? <div className="alert" style={{ marginBottom: 14 }}>{actionError}</div> : null}
      {actionMessage ? <div className="alert alert--info" style={{ marginBottom: 14 }}>{actionMessage}</div> : null}
      {prescriptionsQuery.isError ? (
        <div className="alert" style={{ marginBottom: 14 }}>No pudimos cargar las recetas. Intentalo nuevamente.</div>
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
                  <th>Indicaciones</th>
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
                    <td data-label="Indicaciones">{prescription.items.length} registro(s)</td>
                    <td data-label="Profesional">{fullName(prescription.profesional)}</td>
                    <td data-label="Sede">{prescription.sede?.nombre}</td>
                    <td data-label="Acciones">
                      <div className="prescription-actions">
                        <Button type="button" aria-label="Ver receta" title="Ver detalle" onClick={() => setViewing(prescription)}>
                          <Eye />
                        </Button>
                        <Button type="button" aria-label="Editar receta" title="Editar" onClick={() => setEditing(prescription)}>
                          <Edit />
                        </Button>
                        <Button
                          type="button"
                          aria-label="Descargar receta en PDF"
                          title="Descargar PDF"
                          disabled={documentBusyId === prescription.id}
                          onClick={() => handleDownload(prescription)}
                        >
                          <Download />
                        </Button>
                        <Button
                          type="button"
                          variant="whatsapp"
                          aria-label="Preparar receta para WhatsApp"
                          title="Preparar para WhatsApp"
                          onClick={() => setSharing(prescription)}
                        >
                          <MessageCircle />
                        </Button>
                        <Button type="button" aria-label="Imprimir receta" title="Imprimir" onClick={() => printPrescription(prescription)}>
                          <Printer />
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          aria-label="Eliminar receta"
                          title="Eliminar"
                          disabled={deleteMutation.isPending}
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
          <EmptyState title="Aun no hay recetas registradas" description="Las recetas emitidas quedaran disponibles para consulta y descarga." />
        )}
      </Card>

      {editing ? (
        <PrescriptionModal
          prescription={editing === "new" ? null : editing}
          branches={branches}
          defaultBranchId={selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id ?? ""}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <PrescriptionDetailModal
          prescription={viewing}
          onEdit={() => {
            setViewing(null);
            setEditing(viewing);
          }}
          onDownload={() => handleDownload(viewing)}
          onShare={() => {
            setViewing(null);
            setSharing(viewing);
          }}
          onPrint={() => printPrescription(viewing)}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {sharing ? <PrescriptionShareModal prescription={sharing} onClose={() => setSharing(null)} /> : null}
    </main>
  );
}

function PrescriptionModal({
  prescription,
  branches,
  defaultBranchId,
  onClose
}: {
  prescription: RecetaDetalle | null;
  branches: Array<{ id: string; nombre: string }>;
  defaultBranchId: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({
    queryKey: ["prescription-patients"],
    queryFn: () => listPatients({ pageSize: 300 }),
    enabled: !prescription
  });
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
      paciente_id: prescription?.paciente_id ?? "",
      sede_id: prescription?.sede_id ?? defaultBranchId,
      profesional_id: prescription?.profesional_id ?? "",
      fecha: prescription?.fecha ?? todayISO(),
      diagnostico: prescription?.diagnostico ?? "",
      indicaciones_generales: prescription?.indicaciones_generales ?? "",
      items: prescription?.items.length
        ? prescription.items.map((item) => ({
            medicamento: item.medicamento,
            dosis: item.dosis ?? "",
            frecuencia: item.frecuencia ?? "",
            duracion: item.duracion ?? "",
            via: item.via ?? "",
            indicaciones: item.indicaciones ?? ""
          }))
        : [{ medicamento: "", dosis: "", frecuencia: "", duracion: "", via: "", indicaciones: "" }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });



  const mutation = useMutation({
    mutationFn: async (values: PrescriptionFormValues) => {
      if (prescription) {
        await updatePrescription(prescription.id, values);
        return;
      }
      await createPrescription(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["patient-prescriptions"] });
      onClose();
    },
    onError: (nextError) => setError(getErrorMessage(nextError, "No se pudo guardar la receta"))
  });

  return (
    <Modal
      title={prescription ? "Editar receta" : "Nueva receta"}
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
          {prescription ? (
            <Field label="Paciente">
              <Input value={fullName(prescription.paciente)} readOnly />
              <input type="hidden" {...register("paciente_id")} />
            </Field>
          ) : (
            <Field label="Paciente" error={errors.paciente_id?.message}>
              <Select {...register("paciente_id")}>
                <option value="">Seleccionar paciente</option>
                {(patientsQuery.data?.data ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.telefono}</option>
                ))}
              </Select>
            </Field>
          )}
          {prescription ? (
            <Field label="Sede">
              <Input value={prescription.sede?.nombre ?? ""} readOnly />
              <input type="hidden" {...register("sede_id")} />
            </Field>
          ) : (
            <Field label="Sede" error={errors.sede_id?.message}>
              <Select {...register("sede_id")}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
              </Select>
            </Field>
          )}
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
            <Textarea {...register("diagnostico")} placeholder="Opcional" />

          </div>
        </div>

        <div className="prescription-items">
          <div className="section-heading">
            <div>
              <h3>Medicamentos e indicaciones</h3>
              <p>Registra cada producto, tratamiento o recomendacion en una linea separada.</p>
            </div>
            <Button
              type="button"
              disabled={fields.length >= 30}
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
                <div className="field">
                  <label>Indicacion especifica</label>
                  <Input {...register(`items.${index}.indicaciones`)} placeholder="Ej. despues de los alimentos" />

                </div>
              </div>
            </section>
          ))}
          {errors.items?.root?.message ? <span className="field-error">{errors.items.root.message}</span> : null}
        </div>

        <Field label="Indicaciones generales">
          <Textarea {...register("indicaciones_generales")} placeholder="Cuidados, controles u observaciones adicionales" />

        </Field>
      </form>
    </Modal>
  );
}

function PrescriptionDetailModal({
  prescription,
  onEdit,
  onDownload,
  onShare,
  onPrint,
  onClose
}: {
  prescription: RecetaDetalle;
  onEdit: () => void;
  onDownload: () => void;
  onShare: () => void;
  onPrint: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Detalle de receta"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>Cerrar</Button>
          <Button type="button" onClick={onEdit}><Edit /> Editar</Button>
          <Button type="button" onClick={onPrint}><Printer /> Imprimir</Button>
          <Button type="button" onClick={onDownload}><Download /> Descargar PDF</Button>
          <Button type="button" variant="whatsapp" onClick={onShare}><MessageCircle /> WhatsApp</Button>
        </>
      }
    >
      <div className="stack">
        <section className="prescription-document-summary">
          <div><span>Paciente</span><strong>{fullName(prescription.paciente)}</strong></div>
          <div><span>DNI</span><strong>{prescription.paciente?.dni ?? "No registrado"}</strong></div>
          <div><span>Fecha</span><strong>{toReadableDateLong(prescription.fecha)}</strong></div>
          <div><span>Profesional</span><strong>{fullName(prescription.profesional)}</strong></div>
          <div><span>Especialidad</span><strong>{prescription.profesional?.especialidad ?? "No registrada"}</strong></div>
          <div><span>Sede</span><strong>{prescription.sede?.nombre ?? "No registrada"}</strong></div>
        </section>
        {prescription.diagnostico ? <PrescriptionTextSection title="Diagnostico" value={prescription.diagnostico} /> : null}
        <section className="prescription-detail-list">
          <h3>Medicamentos, tratamientos e indicaciones</h3>
          {prescription.items.map((item, index) => (
            <article key={item.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.medicamento}</strong>
                <p>{[item.dosis, item.frecuencia, item.duracion, item.via].filter(Boolean).join(" · ") || "Sin pauta adicional"}</p>
                {item.indicaciones ? <small>{item.indicaciones}</small> : null}
              </div>
            </article>
          ))}
        </section>
        {prescription.indicaciones_generales ? (
          <PrescriptionTextSection title="Indicaciones generales" value={prescription.indicaciones_generales} />
        ) : null}
      </div>
    </Modal>
  );
}

function PrescriptionTextSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="prescription-document-section">
      <h3>{title}</h3>
      <p>{value}</p>
    </section>
  );
}

function PrescriptionShareModal({ prescription, onClose }: { prescription: RecetaDetalle; onClose: () => void }) {
  const patientName = fullName(prescription.paciente);
  const phone = prescription.paciente?.telefono ?? "";
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canOpenWhatsApp = hasValidWhatsAppPhone(phone);

  const continueToWhatsApp = async () => {
    setBusy(true);
    setError(null);
    const whatsappWindow = window.open("", "_blank");
    if (whatsappWindow) whatsappWindow.opener = null;

    try {
      const fileName = await downloadPrescriptionPdf(prescription);
      const message = buildPrescriptionShareMessage(patientName);
      try {
        await recordPrescriptionDocumentAction(prescription.id, "intento_compartir_whatsapp", {
          file_name: fileName,
          phone_last_digits: phone.replace(/\D/g, "").slice(-4)
        });
      } catch (auditError) {
        setError(`WhatsApp se preparo, pero la auditoria no pudo registrarse. ${getErrorMessage(auditError, "")}`);
      }

      if (!whatsappWindow) {
        throw new Error("El navegador bloqueo la nueva ventana. Permite ventanas emergentes e intentalo nuevamente.");
      }
      whatsappWindow.location.href = buildWhatsAppUrl(phone, message);
      setCompleted(true);
    } catch (nextError) {
      whatsappWindow?.close();
      setError(getErrorMessage(nextError, "No se pudo preparar la receta para WhatsApp."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Enviar receta"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>{completed ? "Cerrar" : "Cancelar"}</Button>
          {!completed ? (
            <Button type="button" variant="whatsapp" disabled={busy || !canOpenWhatsApp} onClick={continueToWhatsApp}>
              <MessageCircle />
              {busy ? "Preparando..." : "Continuar a WhatsApp"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <section className="share-document-summary">
          <FileText />
          <div><span>Paciente</span><strong>{patientName}</strong></div>
          <div><span>Telefono</span><strong>{phone || "No registrado"}</strong></div>
          <div><span>Documento</span><strong>Receta</strong></div>
        </section>
        {!canOpenWhatsApp ? <div className="alert">El paciente no tiene un numero celular peruano valido para WhatsApp.</div> : null}
        {error ? <div className="alert">{error}</div> : null}
        {completed ? (
          <div className="alert alert--info">
            WhatsApp se abrio con el mensaje preparado. El PDF ya fue descargado: debes adjuntarlo manualmente antes de enviar.
          </div>
        ) : (
          <div className="alert alert--info">
            El sistema descargara la receta y abrira la conversacion correcta. WhatsApp Web requiere que adjuntes el PDF manualmente.
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, Download, Edit, FilePlus2, LockKeyhole, Plus, Radio, ShieldAlert, Trash2 } from "lucide-react";
import { MusaCashAccessGate } from "../components/sales/MusaCashAccessGate";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { useDraft } from "../context/DraftContext";
import { toReadableDate } from "../lib/date";
import { fullName } from "../lib/format";
import { downloadSaleReceiptPdf } from "../lib/print";
import { queryClient } from "../lib/queryClient";
import { getMusaCashSecurityStatus, heartbeatMusaCashAccess, lockMusaCashAccess } from "../services/cashSecurity";
import { listServices } from "../services/catalog";
import { listPatients } from "../services/patients";
import { createSale, listSales, saleSchema, softDeleteSale, subscribeToSalesChanges, updateSale, type SaleFormValues } from "../services/sales";
import type { VentaDetalle } from "../types/domain";

const PAYMENT_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia", mixto: "Mixto", otro: "Otro" };
const money = (value: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);

export function SalesPage() {
  const { profile } = useAuth();
  const { selectedBranchId, setSelectedBranchId, branches } = useBranch();
  const [open, setOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<VentaDetalle | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const musaBranch = branches.find((branch) => branch.nombre.trim().toLocaleLowerCase("es-PE") === "musa");
  const isMusaSelected = selectedBranchId === musaBranch?.id;
  const shouldCheckMusa = Boolean(isMusaSelected || (selectedBranchId === "all" && profile?.rol === "administrador"));
  const musaSecurityQuery = useQuery({
    queryKey: ["musa-cash-security", profile?.id],
    queryFn: getMusaCashSecurityStatus,
    enabled: Boolean(musaBranch && shouldCheckMusa),
    retry: false,
    refetchInterval: 5_000
  });
  const musaAuthorized = shouldCheckMusa && (musaSecurityQuery.data?.autorizado ?? false);
  const salesQuery = useQuery({
    queryKey: ["sales", selectedBranchId, from, to, musaAuthorized],
    queryFn: () => listSales(selectedBranchId, from, to),
    enabled: !shouldCheckMusa || (Boolean(musaSecurityQuery.data) && (!isMusaSelected || musaAuthorized))
  });
  const rows = useMemo(() => salesQuery.data ?? [], [salesQuery.data]);
  const totals = useMemo(() => ({
    total: rows.filter((sale) => sale.estado === "pagada").reduce((sum, sale) => sum + Number(sale.total), 0),
    operations: rows.length,
    cash: rows.filter((sale) => sale.metodo_pago === "efectivo" && sale.estado === "pagada").reduce((sum, sale) => sum + Number(sale.total), 0),
    digital: rows.filter((sale) => ["yape", "plin", "tarjeta", "transferencia"].includes(sale.metodo_pago) && sale.estado === "pagada").reduce((sum, sale) => sum + Number(sale.total), 0)
  }), [rows]);
  const deleteMutation = useMutation({
    mutationFn: softDeleteSale,
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (nextError) => setActionError(nextError instanceof Error ? nextError.message : "No se pudo anular la venta")
  });
  const lockMutation = useMutation({
    mutationFn: lockMusaCashAccess,
    onSuccess: () => {
      setOpen(false);
      setEditingSale(null);
      queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (nextError) => setActionError(nextError instanceof Error ? nextError.message : "No se pudo bloquear Caja Musa")
  });

  useEffect(() => subscribeToSalesChanges(() => {
    queryClient.invalidateQueries({ queryKey: ["sales"] });
  }), []);

  useEffect(() => {
    if (!musaAuthorized) return;
    let active = true;

    const heartbeat = async () => {
      try {
        const alive = await heartbeatMusaCashAccess();
        if (!alive && active) {
          setOpen(false);
          setEditingSale(null);
          queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
          queryClient.invalidateQueries({ queryKey: ["sales"] });
        }
      } catch (nextError) {
        if (active) setActionError(nextError instanceof Error ? nextError.message : "Se perdio la conexion en tiempo real con Caja Musa.");
      }
    };

    void heartbeat();
    const intervalId = window.setInterval(heartbeat, 20_000);
    const resume = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", resume);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", resume);
      void lockMusaCashAccess().catch(() => undefined);
    };
  }, [musaAuthorized]);

  useEffect(() => {
    if (!musaSecurityQuery.data || musaAuthorized) return;
    setOpen(false);
    setEditingSale(null);
  }, [musaAuthorized, musaSecurityQuery.data]);

  useEffect(() => {
    if (!(location.state as { openNewSale?: boolean } | null)?.openNewSale) return;
    if (isMusaSelected && !musaAuthorized) return;
    setEditingSale(null);
    setOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [isMusaSelected, location.pathname, location.state, musaAuthorized, navigate]);

  const lockedMusaId = musaBranch && !musaAuthorized ? musaBranch.id : null;
  const defaultSaleBranchId = selectedBranchId !== "all"
    ? selectedBranchId
    : branches.find((branch) => branch.id !== lockedMusaId)?.id ?? "";
  const pageAction = isMusaSelected && !musaAuthorized ? null : (
    <div className="inline">
      <span className="live-status" title="Las ventas se actualizan automaticamente"><Radio /> En vivo</span>
      {musaAuthorized && shouldCheckMusa ? (
        <Button type="button" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
          <LockKeyhole /> {lockMutation.isPending ? "Bloqueando..." : "Bloquear Caja Musa"}
        </Button>
      ) : null}
      <Button type="button" variant="primary" onClick={() => { setEditingSale(null); setOpen(true); }}>
        <FilePlus2 /> Nueva venta
      </Button>
    </div>
  );

  if (shouldCheckMusa && musaSecurityQuery.isLoading) {
    return <main className="page"><PageHeader eyebrow="Caja y contabilidad" title="Caja y ventas de Musa" description="Verificando autorizacion financiera." /><TableSkeleton rows={4} /></main>;
  }

  if (shouldCheckMusa && musaSecurityQuery.error) {
    return <main className="page"><PageHeader eyebrow="Caja y contabilidad" title="Caja y ventas" description="Informacion financiera protegida por sede." /><div className="alert">{musaSecurityQuery.error instanceof Error ? musaSecurityQuery.error.message : "No se pudo verificar el acceso a Caja Musa."}</div></main>;
  }

  if (isMusaSelected && musaSecurityQuery.data && !musaAuthorized) {
    return (
      <main className="page">
        <PageHeader eyebrow="Caja y contabilidad" title="Caja y ventas de Musa" description="Informacion financiera protegida por sede." />
        <MusaCashAccessGate
          status={musaSecurityQuery.data}
          isAdministrator={profile?.rol === "administrador"}
          onUnlocked={() => {
            queryClient.invalidateQueries({ queryKey: ["musa-cash-security"] });
            queryClient.invalidateQueries({ queryKey: ["sales"] });
          }}
          onConfigure={() => navigate("/administracion?seccion=seguridad")}
        />
      </main>
    );
  }

  return <main className="page">
    <PageHeader eyebrow="Caja y contabilidad" title="Registro de ventas" description="Registra cada cobro, conserva su detalle y controla los ingresos por sede y medio de pago." action={pageAction} />
    {selectedBranchId === "all" && musaBranch && !musaAuthorized ? (
      <div className="alert alert--info cash-security-notice">
        <ShieldAlert />
        <span>Las ventas de Musa estan protegidas y no se incluyen en este consolidado.</span>
        <Button type="button" onClick={() => setSelectedBranchId(musaBranch.id)}>Desbloquear Musa</Button>
      </div>
    ) : null}
    <div className="grid grid--metrics sales-metrics">
      <Card><div className="metric"><span className="metric__label">Ingresos</span><strong className="metric__value">{money(totals.total)}</strong><small className="metric__hint">Ventas pagadas</small></div></Card>
      <Card><div className="metric"><span className="metric__label">Operaciones</span><strong className="metric__value">{totals.operations}</strong><small className="metric__hint">En el periodo</small></div></Card>
      <Card><div className="metric"><span className="metric__label">Efectivo</span><strong className="metric__value">{money(totals.cash)}</strong><small className="metric__hint">Cobrado en caja</small></div></Card>
      <Card><div className="metric"><span className="metric__label">Pagos digitales</span><strong className="metric__value">{money(totals.digital)}</strong><small className="metric__hint">Yape, Plin, tarjeta y transferencia</small></div></Card>
    </div>
    <div className="toolbar sales-toolbar"><div className="toolbar__filters"><Field label="Desde"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="Hasta"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field></div></div>
    {salesQuery.error ? <div className="alert">{salesQuery.error instanceof Error ? salesQuery.error.message : "No se pudieron cargar las ventas"}</div> : null}
    {actionError ? <div className="alert">{actionError}</div> : null}
    <Card>
      {salesQuery.isLoading ? <TableSkeleton /> : rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>N. venta</th><th>Cliente</th><th>Detalle</th><th>Pago</th><th>Sede</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{rows.map((sale) => <tr key={sale.id}>
        <td data-label="Fecha">{toReadableDate(sale.fecha.slice(0, 10))}</td>
        <td data-label="N. venta"><strong>{sale.comprobante ? `${sale.comprobante.serie}-${String(sale.comprobante.numero).padStart(8, "0")}` : sale.id.slice(0, 8).toUpperCase()}</strong></td>
        <td data-label="Cliente"><strong>{sale.comprobante?.cliente_nombre ?? fullName(sale.paciente)}</strong><div className="muted">{sale.comprobante?.cliente_numero_documento}</div></td>
        <td data-label="Detalle">{sale.items.map((item) => item.descripcion).join(", ")}</td>
        <td data-label="Pago">{PAYMENT_LABELS[sale.metodo_pago]}{sale.numero_operacion ? <div className="muted">Op. {sale.numero_operacion}</div> : null}</td>
        <td data-label="Sede">{sale.sede?.nombre}</td><td data-label="Total"><strong>{money(Number(sale.total))}</strong></td>
        <td data-label="Acciones"><div className="inline"><Button type="button" aria-label="Descargar constancia de venta" title="Descargar constancia PDF" onClick={() => { void downloadSaleReceiptPdf(sale).catch((downloadError) => setActionError(downloadError instanceof Error ? downloadError.message : "No se pudo descargar la constancia")); }}><Download /></Button><Button type="button" aria-label="Editar venta" title="Editar venta" onClick={() => { setEditingSale(sale); setOpen(true); }}><Edit /></Button><Button type="button" variant="danger" aria-label="Anular venta" title="Anular venta" disabled={deleteMutation.isPending} onClick={() => { if (confirm("Anular esta venta? El movimiento quedara conservado en auditoria.")) deleteMutation.mutate(sale.id); }}><Trash2 /></Button></div></td>
      </tr>)}</tbody></table></div> : <EmptyState title="No hay ventas en el periodo" description="Cada cobro registrado aparecera aqui con su detalle y medio de pago." />}
    </Card>
    {open ? <SaleModal sale={editingSale} branches={branches} lockedBranchId={lockedMusaId} defaultBranchId={defaultSaleBranchId} onClose={() => { setOpen(false); setEditingSale(null); }} /> : null}
  </main>;
}
function SaleModal({ sale, branches, lockedBranchId, defaultBranchId, onClose }: { sale: VentaDetalle | null; branches: Array<{ id: string; nombre: string }>; lockedBranchId: string | null; defaultBranchId: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({ queryKey: ["sale-patients"], queryFn: () => listPatients({ pageSize: 300 }) });
  const servicesQuery = useQuery({ queryKey: ["sale-services"], queryFn: () => listServices() });
  const { draft, recovered, saveDraft, clearDraft } = useDraft<SaleFormValues>("sale:new", !sale);
  const form = useForm<SaleFormValues>({ resolver: zodResolver(saleSchema), defaultValues: sale ? { paciente_id: sale.paciente_id ?? "", cita_id: sale.cita_id, sede_id: sale.sede_id, metodo_pago: sale.metodo_pago, descuento: Number(sale.descuento), igv: Number(sale.igv), numero_operacion: sale.numero_operacion ?? "", observaciones: sale.observaciones ?? "", cliente_tipo_documento: sale.comprobante?.cliente_tipo_documento ?? "", cliente_numero_documento: sale.comprobante?.cliente_numero_documento ?? "", cliente_nombre: sale.comprobante?.cliente_nombre ?? fullName(sale.paciente), cliente_direccion: sale.comprobante?.cliente_direccion ?? "", items: sale.items.map((item) => ({ servicio_id: item.servicio_id ?? "", producto_id: item.producto_id ?? "", descripcion: item.descripcion, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) })) } : draft ?? { paciente_id: "", cita_id: null, sede_id: defaultBranchId, metodo_pago: "efectivo", descuento: 0, igv: 0, numero_operacion: "", observaciones: "", cliente_tipo_documento: "DNI", cliente_numero_documento: "", cliente_nombre: "", cliente_direccion: "", items: [{ servicio_id: "", producto_id: "", descripcion: "", cantidad: 1, precio_unitario: 0 }] } });
  const { register, control, handleSubmit, setValue, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const patientId = useWatch({ control, name: "paciente_id" });
  const watchedItems = useWatch({ control, name: "items" });
  const discount = Number(useWatch({ control, name: "descuento" }) || 0);
  const tax = Number(useWatch({ control, name: "igv" }) || 0);
  const subtotal = (watchedItems ?? []).reduce((sum, item) => sum + Number(item?.cantidad || 0) * Number(item?.precio_unitario || 0), 0);
  const total = subtotal - discount + tax;

  useEffect(() => {
    if (sale) return;
    const subscription = form.watch((values) => saveDraft(values as SaleFormValues));
    return () => subscription.unsubscribe();
  }, [form, sale, saveDraft]);

  useEffect(() => {
    const patient = (patientsQuery.data?.data ?? []).find((item) => item.id === patientId);
    if (!patient || sale) return;
    setValue("cliente_nombre", fullName(patient));
    setValue("cliente_numero_documento", patient.dni ?? "");
    setValue("cliente_direccion", patient.direccion ?? "");
  }, [patientId, patientsQuery.data, sale, setValue]);

  const mutation = useMutation({ mutationFn: async (values: SaleFormValues) => { if (sale) await updateSale(sale.id, values); else await createSale(values); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sales"] }); clearDraft(); onClose(); }, onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar la venta") });
  return <Modal title={sale ? "Editar venta" : "Registrar venta"} onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button>{recovered && !sale ? <Button type="button" variant="danger" onClick={() => { clearDraft(); onClose(); }}>Descartar borrador</Button> : null}<Button type="submit" form="sale-form" variant="primary" disabled={mutation.isPending}><Banknote />{mutation.isPending ? "Guardando..." : sale ? "Guardar cambios" : `Cobrar ${money(Math.max(total, 0))}`}</Button></>}>
    <form id="sale-form" className="stack" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      {error ? <div className="alert">{error}</div> : null}
      {recovered && !sale ? <div className="draft-notice">Recuperamos la venta que dejaste en proceso.</div> : null}
      <section className="form-section"><h3>Cliente y cobro</h3><div className="form-grid form-grid--three">
        <Field label="Paciente" error={errors.paciente_id?.message}><Select {...register("paciente_id")}><option value="">Seleccionar paciente</option>{(patientsQuery.data?.data ?? []).map((patient) => <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.telefono}</option>)}</Select></Field>
        <Field label="Sede" error={errors.sede_id?.message}>{sale ? <><Input value={sale.sede?.nombre ?? ""} readOnly /><input type="hidden" {...register("sede_id")} /></> : <Select {...register("sede_id")}>{branches.map((branch) => <option key={branch.id} value={branch.id} disabled={branch.id === lockedBranchId}>{branch.nombre}{branch.id === lockedBranchId ? " (requiere PIN)" : ""}</option>)}</Select>}</Field>
        <Field label="Medio de pago"><Select {...register("metodo_pago")}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
        <Field label="Numero de operacion"><Input {...register("numero_operacion")} placeholder="Opcional" /></Field>
      </div></section>
      <section className="form-section"><div className="section-heading"><div><h3>Conceptos</h3><p>El precio se puede ajustar antes de registrar la venta.</p></div><Button type="button" onClick={() => append({ servicio_id: "", producto_id: "", descripcion: "", cantidad: 1, precio_unitario: 0 })}><Plus /> Agregar</Button></div>
        <div className="sale-items">{fields.map((field, index) => <div className="sale-item" key={field.id}>
          <Field label="Servicio"><Select {...register(`items.${index}.servicio_id`)} onChange={(event) => { const service = (servicesQuery.data ?? []).find((item) => item.id === event.target.value); setValue(`items.${index}.servicio_id`, event.target.value); setValue(`items.${index}.producto_id`, null); if (service) { setValue(`items.${index}.descripcion`, service.nombre); setValue(`items.${index}.precio_unitario`, Number(service.precio ?? 0)); } }}><option value="">Concepto libre</option>{(servicesQuery.data ?? []).map((service) => <option key={service.id} value={service.id}>{service.nombre}</option>)}</Select></Field>
          <Field label="Descripcion" error={errors.items?.[index]?.descripcion?.message}><Input {...register(`items.${index}.descripcion`)} /></Field>
          <Field label="Cantidad"><Input type="number" min="0.01" step="0.01" {...register(`items.${index}.cantidad`)} /></Field>
          <Field label="Precio unitario"><Input type="number" min="0" step="0.01" {...register(`items.${index}.precio_unitario`)} /></Field>
          <Button type="button" variant="ghost" aria-label={`Quitar concepto ${index + 1}`} disabled={fields.length === 1} onClick={() => remove(index)}><Trash2 /></Button>
        </div>)}</div>
      </section>
      <section className="form-section"><h3>Datos de la venta</h3><div className="form-grid form-grid--three">
        <Field label="Tipo de documento"><Select {...register("cliente_tipo_documento")}><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">Carnet de extranjeria</option><option value="">Sin documento</option></Select></Field>
        <Field label="Documento" error={errors.cliente_numero_documento?.message}><Input {...register("cliente_numero_documento")} /></Field>
        <Field label="Nombre o razon social" error={errors.cliente_nombre?.message}><Input {...register("cliente_nombre")} /></Field>
        <div className="field span-2"><label>Direccion</label><Input {...register("cliente_direccion")} /></div>
        <Field label="Descuento"><Input type="number" min="0" step="0.01" {...register("descuento")} /></Field><Field label="Impuesto o recargo"><Input type="number" min="0" step="0.01" {...register("igv")} /></Field>
        <Field label="Observaciones"><Textarea {...register("observaciones")} /></Field>
      </div><div className="sale-total"><span>Subtotal {money(subtotal)}</span><span>Descuento {money(discount)}</span>{tax > 0 ? <span>Recargo {money(tax)}</span> : null}<strong>Total {money(Math.max(total, 0))}</strong></div></section>
    </form>
  </Modal>;
}

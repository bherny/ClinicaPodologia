import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { VentaDetalle } from "../types/domain";

const db = supabase as any;
const money = z.coerce.number().min(0, "El importe no puede ser negativo");

function saleActionError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("update_sale") || message.includes("soft_delete_sale")) {
    return new Error("La base de datos requiere la actualización de ventas. Ejecuta la migración 202607130005_repair_sales_actions.sql en Supabase.");
  }
  return new Error(message || fallback);
}

export const saleItemSchema = z.object({
  servicio_id: z.string().optional().nullable(),
  descripcion: z.string().trim().min(2, "Ingresa la descripcion"),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor a cero"),
  precio_unitario: money
});

export const saleSchema = z.object({
  paciente_id: z.string().uuid("Selecciona un paciente"),
  cita_id: z.string().optional().nullable(),
  sede_id: z.string().uuid("Selecciona una sede"),
  metodo_pago: z.enum(["efectivo", "yape", "plin", "tarjeta", "transferencia", "mixto", "otro"]),
  descuento: money,
  igv: money,
  numero_operacion: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
  cliente_tipo_documento: z.string().trim().optional(),
  cliente_numero_documento: z.string().trim().optional(),
  cliente_nombre: z.string().trim().min(2, "Ingresa el nombre del cliente"),
  cliente_direccion: z.string().trim().optional(),
  items: z.array(saleItemSchema).min(1, "Agrega al menos un concepto")
});

export type SaleFormValues = z.infer<typeof saleSchema>;

const saleSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni,direccion), sede:sedes(id,nombre,direccion,telefono), items:venta_items(*), comprobante:comprobantes(*)";

export async function listSales(branchId: string, from?: string, to?: string) {
  let query = db.from("ventas").select(saleSelect).eq("eliminado", false).order("fecha", { ascending: false }).limit(300);
  if (branchId !== "all") query = query.eq("sede_id", branchId);
  if (from) query = query.gte("fecha", `${from}T00:00:00`);
  if (to) query = query.lte("fecha", `${to}T23:59:59`);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar las ventas.");
  return (data ?? []).map((sale: VentaDetalle & { comprobante?: unknown }) => ({
    ...sale,
    comprobante: Array.isArray(sale.comprobante) ? sale.comprobante[0] ?? null : sale.comprobante ?? null
  })) as VentaDetalle[];
}

export async function createSale(values: SaleFormValues) {
  const { data, error } = await db.rpc("create_sale", {
    p_patient_id: values.paciente_id,
    p_appointment_id: values.cita_id || null,
    p_branch_id: values.sede_id,
    p_payment_method: values.metodo_pago,
    p_discount: values.descuento,
    p_tax: values.igv,
    p_operation_number: values.numero_operacion ?? "",
    p_notes: values.observaciones ?? "",
    // Correlativo interno para identificar la venta; no representa emision fiscal.
    p_receipt_type: "nota_venta",
    p_customer_document_type: values.cliente_tipo_documento ?? "",
    p_customer_document_number: values.cliente_numero_documento ?? "",
    p_customer_name: values.cliente_nombre,
    p_customer_address: values.cliente_direccion ?? "",
    p_items: values.items.map((item) => ({ ...item, servicio_id: item.servicio_id || null }))
  });
  if (error) throw new Error(error.message ?? "No se pudo registrar la venta.");
  return data as string;
}

export async function updateSale(id: string, values: SaleFormValues) {
  const { error } = await db.rpc("update_sale", {
    p_sale_id: id,
    p_patient_id: values.paciente_id,
    p_payment_method: values.metodo_pago,
    p_discount: values.descuento,
    p_tax: values.igv,
    p_operation_number: values.numero_operacion ?? "",
    p_notes: values.observaciones ?? "",
    p_customer_document_type: values.cliente_tipo_documento ?? "",
    p_customer_document_number: values.cliente_numero_documento ?? "",
    p_customer_name: values.cliente_nombre,
    p_customer_address: values.cliente_direccion ?? "",
    p_items: values.items.map((item) => ({ ...item, servicio_id: item.servicio_id || null }))
  });
  if (error) throw saleActionError(error, "No se pudo actualizar la venta.");
}

export async function softDeleteSale(id: string) {
  const { error } = await db.rpc("soft_delete_sale", { p_sale_id: id });
  if (error) throw saleActionError(error, "No se pudo anular la venta.");
}

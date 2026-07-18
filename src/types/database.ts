import type {
  Auditoria,
  Cita,
  Comprobante,
  ExpedientePodologia,
  HistoriaClinica,
  Paciente,
  Perfil,
  Profesional,
  Receta,
  RecetaItem,
  Recordatorio,
  Sede,
  Servicio,
  Venta,
  VentaItem
} from "./domain";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Insert<T> = Partial<Omit<T, "id" | "created_at" | "updated_at">> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type Update<T> = Partial<Insert<T>>;

export type Database = {
  public: {
    Tables: {
      perfiles: {
        Row: Perfil;
        Insert: Insert<Perfil>;
        Update: Update<Perfil>;
      };
      sedes: {
        Row: Sede;
        Insert: Insert<Sede>;
        Update: Update<Sede>;
      };
      pacientes: {
        Row: Paciente;
        Insert: Insert<Paciente>;
        Update: Update<Paciente>;
      };
      servicios: {
        Row: Servicio;
        Insert: Insert<Servicio>;
        Update: Update<Servicio>;
      };
      profesionales: {
        Row: Profesional;
        Insert: Insert<Profesional>;
        Update: Update<Profesional>;
      };
      citas: {
        Row: Cita;
        Insert: Insert<Cita>;
        Update: Update<Cita>;
      };
      historias_clinicas: {
        Row: HistoriaClinica;
        Insert: Insert<HistoriaClinica>;
        Update: Update<HistoriaClinica>;
      };
      recordatorios: {
        Row: Recordatorio;
        Insert: Insert<Recordatorio>;
        Update: Update<Recordatorio>;
      };
      recetas: {
        Row: Receta;
        Insert: Insert<Receta>;
        Update: Update<Receta>;
      };
      receta_items: {
        Row: RecetaItem;
        Insert: Insert<RecetaItem>;
        Update: Update<RecetaItem>;
      };
      expedientes_podologia: {
        Row: ExpedientePodologia;
        Insert: Insert<ExpedientePodologia>;
        Update: Update<ExpedientePodologia>;
      };
      ventas: {
        Row: Venta;
        Insert: Insert<Venta>;
        Update: Update<Venta>;
      };
      venta_items: {
        Row: VentaItem;
        Insert: Insert<VentaItem>;
        Update: Update<VentaItem>;
      };
      comprobantes: {
        Row: Comprobante;
        Insert: Insert<Comprobante>;
        Update: Update<Comprobante>;
      };
      auditoria: {
        Row: Auditoria;
        Insert: Insert<Auditoria>;
        Update: Update<Auditoria>;
      };
      profesional_sede: {
        Row: { profesional_id: string; sede_id: string; horario_disponible: string | null };
        Insert: { profesional_id: string; sede_id: string; horario_disponible?: string | null };
        Update: { profesional_id?: string; sede_id?: string; horario_disponible?: string | null };
      };
      servicio_sede: {
        Row: { servicio_id: string; sede_id: string };
        Insert: { servicio_id: string; sede_id: string };
        Update: { servicio_id?: string; sede_id?: string };
      };
      profesional_servicio: {
        Row: { profesional_id: string; servicio_id: string };
        Insert: { profesional_id: string; servicio_id: string };
        Update: { profesional_id?: string; servicio_id?: string };
      };
    };
    Views: Record<string, never>;
    Functions: {
      soft_delete_patient: {
        Args: { p_patient_id: string };
        Returns: null;
      };
      soft_delete_appointment: {
        Args: { p_appointment_id: string };
        Returns: null;
      };
      soft_delete_clinical_history: {
        Args: { p_history_id: string };
        Returns: null;
      };
      create_prescription: {
        Args: {
          p_patient_id: string;
          p_branch_id: string;
          p_professional_id: string;
          p_date: string;
          p_diagnosis: string;
          p_general_instructions: string;
          p_items: Json;
        };
        Returns: string;
      };
      soft_delete_prescription: {
        Args: { p_prescription_id: string };
        Returns: null;
      };
      create_sale: {
        Args: {
          p_patient_id: string | null;
          p_appointment_id: string | null;
          p_branch_id: string;
          p_payment_method: string;
          p_discount: number;
          p_tax: number;
          p_operation_number: string;
          p_notes: string;
          p_receipt_type: string;
          p_customer_document_type: string;
          p_customer_document_number: string;
          p_customer_name: string;
          p_customer_address: string;
          p_items: Json;
        };
        Returns: string;
      };
      update_sale: {
        Args: {
          p_sale_id: string;
          p_patient_id: string;
          p_payment_method: string;
          p_discount: number;
          p_tax: number;
          p_operation_number: string;
          p_notes: string;
          p_customer_document_type: string;
          p_customer_document_number: string;
          p_customer_name: string;
          p_customer_address: string;
          p_items: Json;
        };
        Returns: null;
      };
      soft_delete_sale: {
        Args: { p_sale_id: string };
        Returns: null;
      };
      soft_delete_professional: {
        Args: { p_professional_id: string };
        Returns: null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

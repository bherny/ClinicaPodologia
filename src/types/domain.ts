export type RolUsuario = "administrador" | "recepcion" | "profesional";

export type EstadoCita =
  | "pendiente"
  | "confirmada"
  | "atendida"
  | "reprogramada"
  | "cancelada"
  | "no_asistio";

export type EstadoRecordatorio =
  | "programado"
  | "enviado"
  | "pendiente_respuesta"
  | "confirmado"
  | "reprogramado"
  | "cancelado"
  | "no_contactado";

export type TipoRecordatorio = "whatsapp" | "telefono" | "manual";

export type SexoPaciente = "femenino" | "masculino" | "otro" | "no_indica";

export type Sede = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
  responsable_sede: string | null;
  activo: boolean;
  created_at: string;
};

export type Perfil = {
  id: string;
  auth_user_id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string | null;
  rol: RolUsuario;
  sede_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type Paciente = {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
  telefono: string;
  telefono_alternativo: string | null;
  fecha_nacimiento: string | null;
  sexo: SexoPaciente | null;
  direccion: string | null;
  observaciones: string | null;
  sede_de_registro_id: string;
  creado_por: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type Servicio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_aproximada: number;
  precio: number | null;
  activo: boolean;
  created_at: string;
};

export type Profesional = {
  id: string;
  nombres: string;
  apellidos: string;
  especialidad: string | null;
  telefono: string | null;
  usuario_id: string | null;
  activo: boolean;
  created_at: string;
};

export type Cita = {
  id: string;
  paciente_id: string;
  sede_id: string;
  servicio_id: string;
  profesional_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  diagnostico: string | null;
  tratamiento: string | null;
  observaciones: string | null;
  estado: EstadoCita;
  creado_por: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type HistoriaClinica = {
  id: string;
  paciente_id: string;
  cita_id: string | null;
  sede_id: string;
  profesional_id: string | null;
  diagnostico: string;
  tratamiento_realizado: string;
  evolucion: string | null;
  recomendaciones: string | null;
  proxima_fecha_sugerida: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type Recordatorio = {
  id: string;
  cita_id: string;
  tipo: TipoRecordatorio;
  fecha_programada: string;
  estado: EstadoRecordatorio;
  fecha_envio: string | null;
  enviado_por: string | null;
  medio: string | null;
  mensaje: string | null;
  observaciones: string | null;
  created_at: string;
};

export type RecetaItem = {
  id: string;
  receta_id: string;
  medicamento: string;
  dosis: string | null;
  frecuencia: string | null;
  duracion: string | null;
  via: string | null;
  indicaciones: string | null;
  orden: number;
  created_at: string;
};

export type Receta = {
  id: string;
  paciente_id: string;
  cita_id: string | null;
  historia_clinica_id: string | null;
  sede_id: string;
  profesional_id: string | null;
  fecha: string;
  diagnostico: string | null;
  indicaciones_generales: string | null;
  creado_por: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type RecetaDetalle = Receta & {
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "telefono" | "dni"> | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad"> | null;
  items: RecetaItem[];
};

export type ExpedientePodologia = {
  id: string;
  paciente_id: string;
  cita_id: string | null;
  sede_id: string;
  profesional_id: string | null;
  fecha: string;
  motivo_consulta: string;
  pulso_pedio_izquierdo: boolean | null;
  pulso_pedio_derecho: boolean | null;
  pulso_tibial_izquierdo: boolean | null;
  pulso_tibial_derecho: boolean | null;
  temperatura: "fria" | "normal" | "caliente" | null;
  tipo_piel: "seca" | "grasa" | "mixta" | null;
  enfermedades: string[];
  otra_enfermedad: string | null;
  tratamientos: string[];
  otro_tratamiento: string | null;
  formas_unas: string[];
  alteraciones_unas: string | null;
  alergias: string | null;
  problemas_piel: string[];
  otro_problema_piel: string | null;
  tipo_pie: "romano" | "egipcio" | "griego" | "cuadrado" | null;
  mapa_anatomico_notas: string | null;
  observaciones: string | null;
  creado_por: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type ExpedientePodologiaDetalle = ExpedientePodologia & {
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "telefono" | "dni" | "direccion" | "fecha_nacimiento"> | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad"> | null;
};

export type EstadoVenta = "pendiente" | "pagada" | "anulada";
export type MetodoPago = "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia" | "mixto" | "otro";
export type TipoComprobante = "nota_venta" | "boleta" | "factura";
export type EstadoComprobante = "borrador" | "pendiente_envio" | "aceptado" | "rechazado" | "anulado";

export type VentaItem = {
  id: string;
  venta_id: string;
  servicio_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  orden: number;
  created_at: string;
};

export type Comprobante = {
  id: string;
  venta_id: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  estado: EstadoComprobante;
  cliente_tipo_documento: string | null;
  cliente_numero_documento: string | null;
  cliente_nombre: string;
  cliente_direccion: string | null;
  proveedor_emision: string | null;
  identificador_externo: string | null;
  respuesta_proveedor: Record<string, unknown> | null;
  xml_url: string | null;
  pdf_url: string | null;
  fecha_emision: string;
  created_at: string;
  updated_at: string;
};

export type Venta = {
  id: string;
  paciente_id: string | null;
  cita_id: string | null;
  sede_id: string;
  fecha: string;
  estado: EstadoVenta;
  metodo_pago: MetodoPago;
  subtotal: number;
  descuento: number;
  igv: number;
  total: number;
  moneda: "PEN";
  numero_operacion: string | null;
  observaciones: string | null;
  creado_por: string | null;
  eliminado: boolean;
  created_at: string;
  updated_at: string;
};

export type VentaDetalle = Venta & {
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "telefono" | "dni" | "direccion"> | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  items: VentaItem[];
  comprobante?: Comprobante | null;
};

export type Auditoria = {
  id: string;
  usuario_id: string | null;
  accion: string;
  tabla_afectada: string;
  registro_id: string | null;
  informacion_anterior: Record<string, unknown> | null;
  informacion_nueva: Record<string, unknown> | null;
  fecha: string;
};

export type PacienteResumen = Paciente & {
  sede?: Pick<Sede, "id" | "nombre"> | null;
};

export type CitaDetalle = Cita & {
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "telefono" | "dni"> | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  servicio?: Pick<Servicio, "id" | "nombre" | "duracion_aproximada"> | null;
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad"> | null;
  recordatorios?: Pick<Recordatorio, "id" | "estado" | "fecha_envio" | "medio" | "mensaje" | "created_at">[];
};

export type SelectOption = {
  value: string;
  label: string;
};

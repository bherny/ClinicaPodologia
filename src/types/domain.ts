export type RolUsuario = "administrador" | "recepcion" | "profesional" | "owner";

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
  color_sidebar: string | null;
  color_primario: string | null;
  color_acento: string | null;
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

export type HistoriaClinicaDetalle = HistoriaClinica & {
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "dni" | "telefono" | "fecha_nacimiento" | "direccion" | "sexo"> | null;
  cita?: (Pick<Cita, "id" | "fecha" | "hora_inicio" | "estado" | "diagnostico" | "tratamiento" | "observaciones"> & {
    servicio?: Pick<Servicio, "id" | "nombre"> | null;
    expedientes_podologia?: Array<
      Pick<
        ExpedientePodologia,
        | "id"
        | "motivo_consulta"
        | "pulso_pedio_izquierdo"
        | "pulso_pedio_derecho"
        | "pulso_tibial_izquierdo"
        | "pulso_tibial_derecho"
        | "temperatura"
        | "tipo_piel"
        | "enfermedades"
        | "otra_enfermedad"
        | "tratamientos"
        | "otro_tratamiento"
        | "formas_unas"
        | "alteraciones_unas"
        | "alergias"
        | "problemas_piel"
        | "otro_problema_piel"
        | "tipo_pie"
        | "mapa_anatomico_notas"
        | "observaciones"
        | "eliminado"
      >
    > | null;
  }) | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad" | "telefono"> | null;
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
  paciente?: Pick<Paciente, "id" | "nombres" | "apellidos" | "telefono" | "dni" | "fecha_nacimiento" | "direccion"> | null;
  sede?: Pick<Sede, "id" | "nombre" | "direccion" | "telefono"> | null;
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad" | "telefono"> | null;
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
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  orden: number;
  created_at: string;
};

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  precio: number;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type TurnoProfesional = {
  id: string;
  profesional_id: string;
  sede_id: string;
  dia_semana: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  es_descanso: boolean;
  tolerancia_minutos: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type TurnoProfesionalDetalle = TurnoProfesional & {
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad" | "activo"> | null;
  sede?: Pick<Sede, "id" | "nombre"> | null;
};

export type EstadoEntradaAsistencia = "a_tiempo" | "tardanza" | "sin_turno";

export type JornadaAsistencia = {
  id: string;
  profesional_id: string;
  sede_id: string;
  turno_id: string | null;
  fecha_local: string;
  entrada_at: string;
  salida_at: string | null;
  foto_entrada_path: string;
  foto_salida_path: string | null;
  estado_entrada: EstadoEntradaAsistencia;
  minutos_trabajados: number | null;
  entrada_request_id: string;
  salida_request_id: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type JornadaAsistenciaDetalle = JornadaAsistencia & {
  profesional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad" | "activo"> | null;
  sede?: Pick<Sede, "id" | "nombre"> | null;
  turno?: Pick<TurnoProfesional, "id" | "hora_inicio" | "hora_fin" | "es_descanso" | "tolerancia_minutos"> | null;
};

export type AttendanceContext = {
  linked: boolean;
  message?: string;
  professional?: Pick<Profesional, "id" | "nombres" | "apellidos" | "especialidad">;
  branch_id?: string;
  expected_type?: "entrada" | "salida";
  server_now?: string;
  local_date?: string;
  open_session_id?: string | null;
  open_since?: string | null;
  shift?: Pick<TurnoProfesional, "id" | "hora_inicio" | "hora_fin" | "es_descanso" | "tolerancia_minutos"> | null;
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

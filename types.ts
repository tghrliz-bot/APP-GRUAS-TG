export interface Session {
  id?: number;
  operator: string;
  shift: string;
  workType: string;
  client?: string;
  startTime: Date;
  endTime?: Date;
}

export interface CraneUsage {
  id?: number;
  sessionId: number;
  crane: string;
  yard: string;
  startHourMeter: number;
  endHourMeter?: number;
  startTime: Date;
  endTime?: Date;
  changeReason?: string;
  changeReasonDetails?: string;
}

export interface Movement {
  id?: number;
  sessionId: number;
  craneUsageId: number;
  timestamp: Date;
  client: string;
  containerNumber: string;
  reason: string;
  yard: string;
  crane: string;
  operator: string;
}

export interface WorkshopRecord {
  id?: number;
  sessionId: number;
  craneUsageId: number;
  timestamp: Date;
  crane: string;
  details: string;
  mechanicName?: string;
}

export interface ActiveSession {
  session: Session;
  craneUsage: CraneUsage;
}

export interface CraneInspection {
  id?: number;
  sessionId: number;
  craneUsageId: number;
  timestamp: Date;
  crane: string;
  operator: string;
  reingresoBypass?: boolean;
  // Seguridad
  frenos: number;
  frenoEstacionamiento: number;
  alarmasBocina: number;
  // Llantas
  llantaDelanteraIzqExt: number;
  llantaDelanteraIzqInt: number;
  llantaDelanteraDerExt: number;
  llantaDelanteraDerInt: number;
  llantaTraseraIzquierda: number;
  llantaTraseraDerecha: number;
  // Fugas
  fugaDetectada: 'Sí' | 'No';
  tipoFuga?: string;
  ubicacionFuga?: string;
  otroDetalleFuga?: string;
  // Operación/Hidráulico
  boom: number;
  spreader: number;
  sideShift: number;
  // Luces y Señales
  lucesTrabajo: number;
  luzSemaforo: number;
  direccionales: number;
  lucesFreno: number;
  lucesFrontales: number;
  // Mecánico básico
  fajas: number;
  tornamesa: number;
  manguerasVisibles: number;
  // Cabina
  ac: number;
  abanicos: number;
  asiento: number;
  parabrisas: number;
  // Comunicación
  radio: number;
}

export type AppConfigKey = 'OPERATORS' | 'SHIFTS' | 'WORK_TYPES' | 'CRANES' | 'YARDS' | 'CLIENTS' | 'MOVEMENT_REASONS' | 'CRANE_CHANGE_REASONS';

export interface AppConfig {
    key: AppConfigKey;
    values: string[];
}

export interface FailureHistoryEntry {
  timestamp: Date;
  operator: string;
  type: 'reported' | 'reopened' | 'status_change' | 'note' | 'recurrence';
  status?: 'Pendiente' | 'En Reparación' | 'Resuelto' | 'Requiere Compra' | 'No Reparado';
  note?: string;
}

export interface CraneFailure {
  id?: number;
  sessionId: number;
  craneUsageId: number;
  timestamp: Date;
  firstReportedAt?: Date; // Original report date/time
  crane: string;
  operator: string;
  itemKey: string;
  itemLabel: string;
  score: number;
  severity: 'Menor' | 'Mayor' | 'Crítico';
  status: 'Pendiente' | 'En Reparación' | 'Resuelto' | 'Requiere Compra' | 'No Reparado';
  resolvedAt?: Date;
  mechanicNotes?: string;
  resolvedBy?: string;
  isCustomManualReport?: boolean;
  history?: FailureHistoryEntry[];
  failureType?: 'Nueva' | 'Recurrente';
  justification?: string;
}


import Dexie, { type Table } from 'dexie';
import { Session, CraneUsage, Movement, AppConfig, AppConfigKey, WorkshopRecord, ActiveSession, CraneInspection, CraneFailure } from '../types';
import { 
    INITIAL_OPERATORS, INITIAL_SHIFTS, INITIAL_WORK_TYPES, INITIAL_CRANES, 
    INITIAL_YARDS, INITIAL_CLIENTS, INITIAL_MOVEMENT_REASONS, INITIAL_CRANE_CHANGE_REASONS
} from '../constants';
import { syncToGoogleSheets, GoogleSheetsPayload } from './sync';
import { db as fdb, auth } from '../firebase';
import { 
    collection, doc, setDoc, getDoc, getDocs, updateDoc, 
    onSnapshot, query, where, orderBy, limit, serverTimestamp,
    getDocFromServer, Timestamp
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface MaintenanceReport {
  id?: number;
  fecha: string;
  hora: string;
  operador: string;
  grua: string;
  descripcion: string;
  criticidad: string;
  sincronizado: number;
}

const db = new Dexie('CraneDB') as Dexie & {
  sessions: Table<Session, number>;
  craneUsages: Table<CraneUsage, number>;
  movements: Table<Movement, number>;
  workshopRecords: Table<WorkshopRecord, number>;
  maintenanceReports: Table<MaintenanceReport, number>;
  appConfig: Table<AppConfig, AppConfigKey>;
  syncQueue: Table<{ id?: number; payload: any; status: 'pending' | 'failed'; timestamp: Date }, number>;
  craneInspections: Table<CraneInspection, number>;
  craneFailures: Table<CraneFailure, number>;
};

db.version(9).stores({
  sessions: '++id, operator, startTime, endTime',
  craneUsages: '++id, sessionId, crane, startTime, endTime',
  movements: '++id, sessionId, craneUsageId, timestamp, containerNumber',
  workshopRecords: '++id, sessionId, craneUsageId, timestamp, crane',
  maintenanceReports: '++id, fecha, hora, operador, grua, criticidad',
  appConfig: '&key',
  syncQueue: '++id, status',
  craneInspections: '++id, sessionId, craneUsageId, crane, operator, timestamp',
  craneFailures: '++id, crane, status, timestamp, severity'
});

export const initializeDb = async () => {
    try {
        await db.open();
    } catch (err) {
        console.error("Error abriendo la base de datos:", err);
    }

    // Test connection to Firestore
    try {
        await getDocFromServer(doc(fdb, 'test', 'connection'));
    } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
        }
    }

    // Sincronizar AppConfig desde Firestore
    onSnapshot(collection(fdb, 'appConfig'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            const data = change.doc.data();
            if (data && data.values) {
                await db.appConfig.put({ key: change.doc.id as AppConfigKey, values: data.values });
            }
        });
    }, (error) => {
        console.error("Error en onSnapshot appConfig:", error);
    });

    const configCount = await db.appConfig.count();
    if (configCount === 0) {
        const initialConfigs: Record<AppConfigKey, string[]> = {
            OPERATORS: INITIAL_OPERATORS,
            SHIFTS: INITIAL_SHIFTS,
            WORK_TYPES: INITIAL_WORK_TYPES,
            CRANES: INITIAL_CRANES,
            YARDS: INITIAL_YARDS,
            CLIENTS: INITIAL_CLIENTS,
            MOVEMENT_REASONS: INITIAL_MOVEMENT_REASONS,
            CRANE_CHANGE_REASONS: INITIAL_CRANE_CHANGE_REASONS,
        };

        for (const [key, values] of Object.entries(initialConfigs)) {
            const configKey = key as AppConfigKey;
            await db.appConfig.put({ key: configKey, values });
            // Intentar subir a Firestore si no existe (solo si el usuario tiene permisos)
            try {
                const docRef = doc(fdb, 'appConfig', configKey);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    await setDoc(docRef, { values });
                }
            } catch (e) {
                // Silently ignore permission errors during initial seeding
                if (!(e instanceof Error && e.message.includes('insufficient permissions'))) {
                    console.warn(`No se pudo inicializar Firestore para ${configKey}:`, e);
                }
            }
        }
    } else {
        // Limpieza de operadores solicitada por el usuario
        // Solo intentamos esto si el usuario está autenticado y es administrador
        // Para evitar errores en la consola de operadores
        const opsConfig = await db.appConfig.get('OPERATORS');
        if (opsConfig) {
            const namesToRemove = ["Jose Zuñiga", "Geiver Watson", "José Zúñiga", "Geiver Watson"];
            let updatedValues = opsConfig.values.filter(o => !namesToRemove.includes(o));
            
            // Asegurar que Ricardo Rodriguez esté incluido
            if (!updatedValues.includes("Ricardo Rodriguez")) {
                updatedValues.push("Ricardo Rodriguez");
            }
            
            if (JSON.stringify(updatedValues) !== JSON.stringify(opsConfig.values)) {
                // Intentamos actualizar localmente siempre
                await db.appConfig.put({ key: 'OPERATORS', values: updatedValues });
                // Intentamos actualizar en Firestore solo si es admin
                try {
                    if (auth.currentUser?.email === 'rfonseca047@gmail.com') {
                        await setDoc(doc(fdb, 'appConfig', 'OPERATORS'), { values: updatedValues });
                    }
                } catch (e) {
                    // Ignorar errores de permisos aquí
                }
            }
        }
    }
    setInterval(processSyncQueue, 60000);
};

const formatTime24h = (date: Date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const generateRequestId = () => {
    return `ID-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
};

let cachedGoogleScriptUrl = '';

export const getCachedGoogleScriptUrl = (): string => {
    return cachedGoogleScriptUrl || localStorage.getItem('GOOGLE_SCRIPT_URL') || (import.meta as any).env.VITE_GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwxOFcAw68PV4sreHWvyNpyHNRvnauMvdtBvZBFPZ6YQwkcegtHKzWpXiZZL4ofXJRl/exec';
};

export const subscribeToGoogleScriptUrl = (callback: (url: string) => void) => {
    const initialUrl = getCachedGoogleScriptUrl();
    callback(initialUrl);

    return onSnapshot(doc(fdb, 'settings', 'googleSheets'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.url) {
                cachedGoogleScriptUrl = data.url;
                localStorage.setItem('GOOGLE_SCRIPT_URL', data.url);
                callback(data.url);
            }
        }
    }, (error) => {
        console.error("Error subscribing to googleSheets url:", error);
    });
};

export const saveGoogleScriptUrl = async (url: string): Promise<void> => {
    cachedGoogleScriptUrl = url;
    localStorage.setItem('GOOGLE_SCRIPT_URL', url);
    try {
        await setDoc(doc(fdb, 'settings', 'googleSheets'), { url });
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'settings/googleSheets');
    }
};

const enqueueSync = async (data: GoogleSheetsPayload) => {
    await db.syncQueue.add({ payload: data, status: 'pending', timestamp: new Date() });
    if (navigator.onLine) processSyncQueue();
};

export const processSyncQueue = async () => {
    if (!navigator.onLine) return;
    try {
        const pending = await db.syncQueue.toArray();
        const currentUrl = getCachedGoogleScriptUrl();
        for (const item of pending) {
            const success = await syncToGoogleSheets(item.payload, currentUrl);
            if (success) await db.syncQueue.delete(item.id!);
            else await db.syncQueue.update(item.id!, { status: 'failed' });
        }
    } catch (err) { console.error(err); }
};

export const getActiveSessionFromDb = async (): Promise<ActiveSession | null> => {
    const openSession = await db.sessions.filter(s => s.endTime === undefined).reverse().first();
    if (!openSession || !openSession.id) return null;
    const activeUsage = await db.craneUsages.where('sessionId').equals(openSession.id).filter(cu => cu.endTime === undefined).reverse().first();
    if (!activeUsage) return null;
    return { session: openSession, craneUsage: activeUsage };
};

export const getAppConfig = async (): Promise<Record<AppConfigKey, string[]>> => {
    const configArray = await db.appConfig.toArray();
    const defaultKeys: Record<AppConfigKey, string[]> = {
        OPERATORS: INITIAL_OPERATORS,
        SHIFTS: INITIAL_SHIFTS,
        WORK_TYPES: INITIAL_WORK_TYPES,
        CLIENTS: INITIAL_CLIENTS,
        CRANES: INITIAL_CRANES,
        YARDS: INITIAL_YARDS,
        MOVEMENT_REASONS: INITIAL_MOVEMENT_REASONS,
        CRANE_CHANGE_REASONS: INITIAL_CRANE_CHANGE_REASONS
    };
    const config = { ...defaultKeys };
    configArray.forEach(curr => {
        if (curr.values && Array.isArray(curr.values) && curr.values.length > 0) {
            config[curr.key] = curr.values;
        }
    });
    return config;
}

export const startNewSession = async (
  operator: string, shift: string, workType: string, crane: string, yard: string, startHourMeter: number, client?: string
): Promise<{ session: Session; craneUsage: CraneUsage }> => {
  if (startHourMeter === undefined || startHourMeter === null || isNaN(startHourMeter)) {
    throw new Error("El horómetro inicial es obligatorio para iniciar sesión.");
  }
  const now = new Date();
  const session: Session = { operator, shift, workType, client: workType === 'Operación de Barco' ? client : undefined, startTime: now };
  
  const result = await db.transaction('rw', [db.sessions, db.craneUsages], async () => {
      const sessionId = await db.sessions.add(session);
      session.id = sessionId;
      const craneUsage: CraneUsage = { sessionId, crane, yard, startHourMeter, startTime: now };
      const craneUsageId = await db.craneUsages.add(craneUsage);
      craneUsage.id = craneUsageId;
      return { session, craneUsage };
  });

  // Firestore Sync outside transaction
  try {
      const sessionRef = doc(fdb, 'sessions', result.session.id!.toString());
      await setDoc(sessionRef, {
          ...result.session,
          startTime: Timestamp.fromDate(now)
      });

      const usageRef = doc(fdb, 'craneUsages', result.craneUsage.id!.toString());
      await setDoc(usageRef, {
          ...result.craneUsage,
          startTime: Timestamp.fromDate(now)
      });
  } catch (e) {
      console.error("Error syncing session to Firestore:", e);
  }

  await enqueueSync({ 
      FECHA: now.toLocaleDateString(), 
      HORA: formatTime24h(now), 
      JORNADA: workType,
      ACCION: 'INICIO SESION',
      OPERADOR: operator, 
      GRUA: crane, 
      PREDIO: yard, 
      CLIEN: client || '',
      CONTENE: '',
      MOTIVO: '',
      comentarios_falla: '',
      HORÓMETRO: startHourMeter.toString()
  });
  return result;
};

export const endCurrentSessionWithMeters = async (
  sessionId: number, finalMeters: Record<number, number>
): Promise<void> => {
  const now = new Date();
  const session = await db.sessions.get(sessionId);
  const updatedUsages: { usage: CraneUsage; meter: number }[] = [];

  await db.transaction('rw', [db.sessions, db.craneUsages], async () => {
    await db.sessions.update(sessionId, { endTime: now });
    
    for (const [idStr, meter] of Object.entries(finalMeters)) {
        if (meter === undefined || meter === null || isNaN(meter)) {
            throw new Error("El horómetro final es obligatorio para finalizar la sesión.");
        }
        const id = parseInt(idStr);
        const usage = await db.craneUsages.get(id);
        if (usage) {
            await db.craneUsages.update(id, { endHourMeter: meter, endTime: now });
            updatedUsages.push({ usage, meter });
        }
    }
  });

  // Firestore Sync & Sync Queue OUTSIDE transaction
  try {
      await updateDoc(doc(fdb, 'sessions', sessionId.toString()), {
          endTime: Timestamp.fromDate(now)
      });
  } catch (e) { console.error("Error syncing session end to Firestore:", e); }

  for (const item of updatedUsages) {
      try {
          await updateDoc(doc(fdb, 'craneUsages', item.usage.id!.toString()), {
              endHourMeter: item.meter,
              endTime: Timestamp.fromDate(now)
          });
      } catch (e) { console.error("Error syncing crane usage end to Firestore:", e); }

      await enqueueSync({
          FECHA: now.toLocaleDateString(),
          HORA: formatTime24h(now),
          JORNADA: session?.workType || '',
          ACCION: 'FINAL SESION',
          OPERADOR: session?.operator || '',
          GRUA: item.usage.crane,
          PREDIO: item.usage.yard,
          CLIEN: session?.client || '',
          CONTENE: '',
          MOTIVO: '',
          comentarios_falla: '',
          HORÓMETRO: item.meter.toString()
      });
  }
};

export const addMovement = async (movement: Omit<Movement, 'id'>): Promise<number> => {
  const id = await db.movements.add(movement as Movement);
  const now = new Date(movement.timestamp);
  const session = await db.sessions.get(movement.sessionId);
  
  // Firestore Sync
  try {
      const movementRef = doc(fdb, 'movements', id.toString());
      await setDoc(movementRef, {
          ...movement,
          timestamp: Timestamp.fromDate(now)
      });
  } catch (e) {
      console.error("Error syncing movement to Firestore:", e);
  }

  // REGISTRO PARA LA HOJA 'REPORTE'
  await enqueueSync({
      FECHA: now.toLocaleDateString(),
      HORA: formatTime24h(now),
      JORNADA: session?.workType || '',
      ACCION: 'MOVIMIENTO',
      OPERADOR: movement.operator,
      GRUA: movement.crane,
      PREDIO: movement.yard,
      CLIEN: movement.client || '',
      CONTENE: movement.containerNumber || '',
      MOTIVO: movement.reason || '',
      comentarios_falla: '',
      HORÓMETRO: ''
  });

  // REGISTRO SECUNDARIO PARA CONSOLIDADO (Opcional, se puede omitir si el script solo espera REPORTE)
  // await enqueueSync({ ... }); 

  return id;
};

export const addWorkshopRecord = async (record: Omit<WorkshopRecord, 'id'>): Promise<number> => {
  const id = await db.workshopRecords.add(record as WorkshopRecord);
  const now = new Date(record.timestamp);
  const session = await db.sessions.get(record.sessionId);
  const usage = await db.craneUsages.get(record.craneUsageId);

  // Firestore Sync
  try {
      const recordRef = doc(fdb, 'workshopRecords', id.toString());
      await setDoc(recordRef, {
          ...record,
          timestamp: Timestamp.fromDate(now)
      });
  } catch (e) {
      console.error("Error syncing workshop record to Firestore:", e);
  }

  await enqueueSync({ 
      FECHA: now.toLocaleDateString(), 
      HORA: formatTime24h(now), 
      JORNADA: session?.workType || '',
      ACCION: 'FALLA MECANICA',
      OPERADOR: session?.operator || '',
      GRUA: record.crane, 
      PREDIO: usage?.yard || '',
      CLIEN: session?.client || '',
      CONTENE: '',
      MOTIVO: 'Reporte Taller',
      comentarios_falla: record.details,
      HORÓMETRO: ''
  });
  return id;
};

export const changeCrane = async (
  oldCraneUsageId: number, changeReason: string, newCrane: string,
  newYard: string, newStartHourMeter: number, sessionId: number, oldEndHourMeter: number, changeReasonDetails?: string
): Promise<CraneUsage> => {
  if (isNaN(newStartHourMeter) || isNaN(oldEndHourMeter)) {
    throw new Error("Los horómetros son obligatorios para el cambio de grúa.");
  }
  const now = new Date();
  const oldUsage = await db.craneUsages.get(oldCraneUsageId);
  const session = await db.sessions.get(sessionId);

  const newCraneUsage = await db.transaction('rw', [db.sessions, db.craneUsages], async () => {
    await db.craneUsages.update(oldCraneUsageId, { changeReason, changeReasonDetails, endHourMeter: oldEndHourMeter, endTime: now });

    const newCraneUsage: CraneUsage = { sessionId, crane: newCrane, yard: newYard, startHourMeter: newStartHourMeter, startTime: now };
    const newCraneUsageId = await db.craneUsages.add(newCraneUsage);
    newCraneUsage.id = newCraneUsageId;
    return newCraneUsage;
  });

  // Firestore Sync Old Usage OUTSIDE transaction
  try {
      await updateDoc(doc(fdb, 'craneUsages', oldCraneUsageId.toString()), {
          changeReason,
          changeReasonDetails: changeReasonDetails || '',
          endHourMeter: oldEndHourMeter,
          endTime: Timestamp.fromDate(now)
      });
  } catch (e) { console.error("Error updating old crane usage to Firestore:", e); }

  // Firestore Sync New Usage OUTSIDE transaction
  try {
      await setDoc(doc(fdb, 'craneUsages', newCraneUsage.id!.toString()), {
          ...newCraneUsage,
          startTime: Timestamp.fromDate(now)
      });
  } catch (e) { console.error("Error creating new crane usage in Firestore:", e); }

  if (oldUsage) {
      await enqueueSync({
          FECHA: now.toLocaleDateString(),
          HORA: formatTime24h(now),
          JORNADA: session?.workType || '',
          ACCION: 'CAMBIO GRÚA',
          OPERADOR: session?.operator || '',
          GRUA: oldUsage.crane,
          PREDIO: oldUsage.yard,
          CLIEN: session?.client || '',
          CONTENE: '',
          MOTIVO: changeReason,
          comentarios_falla: changeReasonDetails || '',
          HORÓMETRO: oldEndHourMeter.toString()
      });
  }
  return newCraneUsage;
};

export const changeYard = async (craneUsageId: number, newYard: string): Promise<void> => {
    const usage = await db.craneUsages.get(craneUsageId);
    if (!usage) return;
    const session = await db.sessions.get(usage.sessionId);
    await db.craneUsages.update(craneUsageId, { yard: newYard });
    
    // Firestore Sync
    try {
        await updateDoc(doc(fdb, 'craneUsages', craneUsageId.toString()), {
            yard: newYard
        });
    } catch (e) { console.error(e); }

    const now = new Date();
    await enqueueSync({ 
        FECHA: now.toLocaleDateString(), 
        HORA: formatTime24h(now), 
        JORNADA: session?.workType || '',
        ACCION: 'CAMBIO PREDIO',
        OPERADOR: session?.operator || '',
        GRUA: usage.crane, 
        PREDIO: newYard,
        CLIEN: session?.client || '',
        CONTENE: '',
        MOTIVO: 'Cambio Predio',
        comentarios_falla: '',
        HORÓMETRO: ''
    });
};

export const getPendingHourMetersForSession = async (sessionId: number): Promise<CraneUsage[]> => {
    return await db.craneUsages.where('sessionId').equals(sessionId).filter(cu => cu.endTime === undefined).toArray();
};

export const getRecentMovements = async (sessionId: number, limit = 5, craneUsageId?: number): Promise<Movement[]> => {
  if (craneUsageId) return db.movements.where('craneUsageId').equals(craneUsageId).reverse().limit(limit).toArray();
  return db.movements.where('sessionId').equals(sessionId).reverse().limit(limit).toArray();
};

export const countSessionMovements = async (sessionId: number): Promise<number> => {
    return await db.movements.where({ sessionId }).count();
}

export const getLastHourMeterForCrane = async (crane: string): Promise<number | undefined> => {
    const usages = await db.craneUsages.where('crane').equals(crane).filter(cu => cu.endHourMeter !== undefined).toArray();
    if (usages.length === 0) {
        if (crane.toLowerCase().includes('sisu')) {
            return 1.0;
        }
        return undefined;
    }
    const latest = usages.sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())[0];
    return latest.endHourMeter;
};

export const getLatestUsageInSession = async (sessionId: number, crane: string): Promise<CraneUsage | undefined> => {
    const usages = await db.craneUsages.where('sessionId').equals(sessionId).filter(cu => cu.crane === crane && cu.endHourMeter !== undefined).toArray();
    if (usages.length === 0) return undefined;
    return usages.sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())[0];
};

export const checkCraneAvailability = async (craneName: string): Promise<{ operator: string, yard: string } | null> => {
    const activeUsage = await db.craneUsages.where('crane').equals(craneName).filter(cu => cu.endTime === undefined).first();
    if (activeUsage) {
        const session = await db.sessions.get(activeUsage.sessionId);
        if (session) return { operator: session.operator, yard: activeUsage.yard };
    }
    return null;
};

export const forceReleaseCrane = async (craneName: string): Promise<void> => {
    const activeUsages = await db.craneUsages.where('crane').equals(craneName).filter(cu => cu.endTime === undefined).toArray();
    const now = new Date();
    const sessionsToUpdate: number[] = [];
    const usagesToSync: { usage: CraneUsage; session: Session | undefined; backupEndMeter: number }[] = [];

    await db.transaction('rw', [db.sessions, db.craneUsages], async () => {
        for (const usage of activeUsages) {
            const backupEndMeter = usage.startHourMeter + 0.1;
            await db.craneUsages.update(usage.id!, { 
                endTime: now, 
                endHourMeter: backupEndMeter,
                changeReason: 'Liberación Forzada de Equipo',
                changeReasonDetails: 'Equipo liberado desde login por otro operador'
            });
            const session = await db.sessions.get(usage.sessionId);
            if (session && session.endTime === undefined) {
                await db.sessions.update(usage.sessionId, { endTime: now });
                sessionsToUpdate.push(usage.sessionId);
            }
            usagesToSync.push({ usage, session, backupEndMeter });
        }
    });

    for (const sessionId of sessionsToUpdate) {
        try {
            await updateDoc(doc(fdb, 'sessions', sessionId.toString()), {
                endTime: Timestamp.fromDate(now)
            });
        } catch (e) { console.error("Error setting session end on force release:", e); }
    }

    for (const item of usagesToSync) {
        try {
            await updateDoc(doc(fdb, 'craneUsages', item.usage.id!.toString()), {
                endTime: Timestamp.fromDate(now),
                endHourMeter: item.backupEndMeter,
                changeReason: 'Liberación Forzada de Equipo',
                changeReasonDetails: 'Equipo liberado desde login por otro operador'
            });
        } catch (e) { console.error("Error setting craneUsage end on force release:", e); }

        await enqueueSync({
            FECHA: now.toLocaleDateString(),
            HORA: formatTime24h(now),
            JORNADA: item.session?.workType || '',
            ACCION: 'FINAL SESION',
            OPERADOR: item.session?.operator || '',
            GRUA: item.usage.crane,
            PREDIO: item.usage.yard,
            CLIEN: item.session?.client || '',
            CONTENE: '',
            MOTIVO: 'Liberación Forzada de Equipo',
            comentarios_falla: 'Equipo liberado desde login por otro operador',
            HORÓMETRO: item.backupEndMeter.toString()
        });
    }
};

export const getAllActiveCranes = async (): Promise<Record<string, { operator: string, yard: string }>> => {
    const activeUsages = await db.craneUsages.filter(cu => cu.endTime === undefined).toArray();
    const result: Record<string, { operator: string, yard: string }> = {};
    for (const usage of activeUsages) {
        const session = await db.sessions.get(usage.sessionId);
        if (session) result[usage.crane] = { operator: session.operator, yard: usage.yard };
    }
    return result;
};

export const findLastMovementByContainer = async (containerNumber: string): Promise<Movement | undefined> => {
    const movements = await db.movements.where('containerNumber').equals(containerNumber).toArray();
    if (movements.length === 0) return undefined;
    return movements.reduce((latest, current) => new Date(latest.timestamp) > new Date(current.timestamp) ? latest : current);
};

export const getAllDataForExport = async () => {
    const sessions = await db.sessions.toArray();
    const craneUsages = await db.craneUsages.toArray();
    const movements = await db.movements.toArray();
    const workshopRecords = await db.workshopRecords.toArray();
    return { sessions, craneUsages, movements, workshopRecords };
}

const computeExtendedDashboardStats = (allMovements: any[], allFailures: any[], cranesConfig: string[]) => {
    const monthlyCraneMovements: Record<string, Record<string, number>> = {};
    const monthlyOperatorMovements: Record<string, Record<string, number>> = {};
    const monthlyClientMovements: Record<string, Record<string, Record<string, number>>> = {};
    const monthlyTypeMovements: Record<string, Record<string, number>> = {};

    const getMonthStr = (dateVal: any): string => {
        if (!dateVal) return 'Sin fecha';
        const date = dateVal instanceof Date ? dateVal : (dateVal.toDate ? dateVal.toDate() : new Date(dateVal));
        if (isNaN(date.getTime())) return 'Fecha inválida';
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    };

    allMovements.forEach(m => {
        const monthKey = getMonthStr(m.timestamp);
        if (monthKey === 'Fecha inválida' || monthKey === 'Sin fecha') return;

        const craneKey = m.crane || 'Desconocido';
        const operatorKey = m.operator || 'Desconocido';
        const clientKey = m.client || 'Sin Cliente';
        const typeKey = m.reason || 'Sin Motivo';

        // 1. crane by month
        if (!monthlyCraneMovements[monthKey]) monthlyCraneMovements[monthKey] = {};
        monthlyCraneMovements[monthKey][craneKey] = (monthlyCraneMovements[monthKey][craneKey] || 0) + 1;

        // 2. operator by month
        if (!monthlyOperatorMovements[monthKey]) monthlyOperatorMovements[monthKey] = {};
        monthlyOperatorMovements[monthKey][operatorKey] = (monthlyOperatorMovements[monthKey][operatorKey] || 0) + 1;

        // 3. types by client by month
        if (!monthlyClientMovements[monthKey]) monthlyClientMovements[monthKey] = {};
        if (!monthlyClientMovements[monthKey][clientKey]) monthlyClientMovements[monthKey][clientKey] = {};
        monthlyClientMovements[monthKey][clientKey][typeKey] = (monthlyClientMovements[monthKey][clientKey][typeKey] || 0) + 1;

        // 4. types by month
        if (!monthlyTypeMovements[monthKey]) monthlyTypeMovements[monthKey] = {};
        monthlyTypeMovements[monthKey][typeKey] = (monthlyTypeMovements[monthKey][typeKey] || 0) + 1;
    });

    // 5. Crane mechanical status
    const craneSet = new Set<string>(cranesConfig || []);
    allFailures.forEach(f => { if (f.crane) craneSet.add(f.crane); });
    allMovements.forEach(m => { if (m.crane) craneSet.add(m.crane); });
    
    const cranesList = Array.from(craneSet);

    const craneMechanicalStatus = cranesList.map(crane => {
        const activeFailures = allFailures.filter(f => f.crane === crane && f.status !== 'Resuelto');
        
        let maxSeverity: 'Ninguno' | 'Menor' | 'Mayor' | 'Crítico' = 'Ninguno';
        let severityScore = 0;
        let recommendation = '✅ EQUIPO OPERATIVO';

        if (activeFailures.some(f => f.severity === 'Crítico')) {
            maxSeverity = 'Crítico';
            severityScore = 3;
            recommendation = '❌ DETENER EQUIPO DE INMEDIATO - DAÑO CRÍTICO DETECTADO';
        } else if (activeFailures.some(f => f.severity === 'Mayor')) {
            maxSeverity = 'Mayor';
            severityScore = 2;
            recommendation = '⚠️ ATENCIÓN URGENTE - DAÑO MAYOR REGISTRADO';
        } else if (activeFailures.some(f => f.severity === 'Menor')) {
            maxSeverity = 'Menor';
            severityScore = 1;
            recommendation = '🔧 SE RECOMIENDA REVISAR - DAÑO MENOR';
        }

        return {
            crane,
            maxSeverity,
            severityScore,
            recommendation,
            activeFailures,
            failuresCount: activeFailures.length
        };
    }).sort((a, b) => {
        if (b.severityScore !== a.severityScore) {
            return b.severityScore - a.severityScore;
        }
        if (b.failuresCount !== a.failuresCount) {
            return b.failuresCount - a.failuresCount;
        }
        return a.crane.localeCompare(b.crane);
    });

    return {
        monthlyCraneMovements,
        monthlyOperatorMovements,
        monthlyClientMovements,
        monthlyTypeMovements,
        craneMechanicalStatus
    };
};

export const getPublicDashboardData = async () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Fetch from Firestore for global visibility
    const activeCranes: Record<string, { operator: string, yard: string }> = {};
    const opSummary: Record<string, number> = {};
    const craneSummary: Record<string, number> = {};
    const clientSummary: Record<string, number> = {};
    const yardSummary: Record<string, number> = {};
    let recentWorkshop: WorkshopRecord[] = [];

    let monthlyCraneMovements: Record<string, Record<string, number>> = {};
    let monthlyOperatorMovements: Record<string, Record<string, number>> = {};
    let monthlyClientMovements: Record<string, Record<string, Record<string, number>>> = {};
    let monthlyTypeMovements: Record<string, Record<string, number>> = {};
    let craneMechanicalStatus: any[] = [];
    let allMovements: any[] = [];
    let allUsages: any[] = [];
    let allSessions: any[] = [];

    try {
        // Active Cranes
        const usagesQuery = query(collection(fdb, 'craneUsages'), where('endTime', '==', null));
        const usagesSnap = await getDocs(usagesQuery);
        
        for (const usageDoc of usagesSnap.docs) {
            const usageData = usageDoc.data();
            const sessionSnap = await getDoc(doc(fdb, 'sessions', usageData.sessionId.toString()));
            if (sessionSnap.exists()) {
                const sessionData = sessionSnap.data();
                activeCranes[usageData.crane] = { 
                    operator: sessionData.operator, 
                    yard: usageData.yard 
                };
            }
        }

        // Today's Movements
        const movementsQuery = query(
            collection(fdb, 'movements'), 
            where('timestamp', '>=', Timestamp.fromDate(startOfDay))
        );
        const movementsSnap = await getDocs(movementsQuery);
        movementsSnap.docs.forEach(mDoc => {
            const m = mDoc.data();
            opSummary[m.operator] = (opSummary[m.operator] || 0) + 1;
            craneSummary[m.crane] = (craneSummary[m.crane] || 0) + 1;
            if (m.client) clientSummary[m.client] = (clientSummary[m.client] || 0) + 1;
            yardSummary[m.yard] = (yardSummary[m.yard] || 0) + 1;
        });

        // Recent Workshop Records
        const workshopQuery = query(
            collection(fdb, 'workshopRecords'),
            where('timestamp', '>=', Timestamp.fromDate(threeDaysAgo)),
            orderBy('timestamp', 'desc')
        );
        const workshopSnap = await getDocs(workshopQuery);
        recentWorkshop = workshopSnap.docs.map(wDoc => {
            const data = wDoc.data();
            return {
                ...data,
                id: parseInt(wDoc.id),
                timestamp: data.timestamp.toDate()
            } as WorkshopRecord;
        });

         // 1. Fetch ALL movements for monthly calculations
        const allMovementsSnap = await getDocs(query(collection(fdb, 'movements')));
        allMovements = allMovementsSnap.docs.map(dDoc => {
            const d = dDoc.data();
            return {
                ...d,
                timestamp: d.timestamp instanceof Timestamp ? d.timestamp.toDate() : new Date(d.timestamp)
            };
        });

        // Fetch ALL crane usages
        const usagesAllSnap = await getDocs(collection(fdb, 'craneUsages'));
        allUsages = usagesAllSnap.docs.map(docSnap => {
            const d = docSnap.data();
            return {
                ...d,
                id: d.id || parseInt(docSnap.id) || docSnap.id,
                startTime: d.startTime instanceof Timestamp ? d.startTime.toDate() : new Date(d.startTime),
                endTime: d.endTime ? (d.endTime instanceof Timestamp ? d.endTime.toDate() : new Date(d.endTime)) : undefined
            };
        });

        // Fetch ALL sessions
        const sessionsAllSnap = await getDocs(collection(fdb, 'sessions'));
        allSessions = sessionsAllSnap.docs.map(docSnap => {
            const d = docSnap.data();
            return {
                ...d,
                id: d.id || parseInt(docSnap.id) || docSnap.id,
                startTime: d.startTime instanceof Timestamp ? d.startTime.toDate() : new Date(d.startTime),
                endTime: d.endTime ? (d.endTime instanceof Timestamp ? d.endTime.toDate() : new Date(d.endTime)) : undefined
            };
        });

        // 2. Fetch ALL crane failures for mechanical status assessment
        const allFailuresSnap = await getDocs(query(collection(fdb, 'craneFailures')));
        const allFailures = allFailuresSnap.docs.map(fDoc => {
            const d = fDoc.data();
            return {
                ...d,
                id: Number(fDoc.id),
                timestamp: d.timestamp instanceof Timestamp ? d.timestamp.toDate() : new Date(d.timestamp)
            };
        });

        const appConfig = await getAppConfig();
        const cranesConfig = appConfig.CRANES || [];

        const extended = computeExtendedDashboardStats(allMovements, allFailures, cranesConfig);
        monthlyCraneMovements = extended.monthlyCraneMovements;
        monthlyOperatorMovements = extended.monthlyOperatorMovements;
        monthlyClientMovements = extended.monthlyClientMovements;
        monthlyTypeMovements = extended.monthlyTypeMovements;
        craneMechanicalStatus = extended.craneMechanicalStatus;

    } catch (e) {
        console.error("Error fetching public dashboard data from Firestore:", e);
        // Fallback to local Dexie if Firestore fails
        return await getPublicDashboardDataLocal();
    }

    return { 
        activeCranes, 
        opSummary, 
        craneSummary, 
        clientSummary, 
        yardSummary, 
        recentWorkshop,
        monthlyCraneMovements,
        monthlyOperatorMovements,
        monthlyClientMovements,
        monthlyTypeMovements,
        craneMechanicalStatus,
        allMovements,
        allUsages,
        allSessions
    };
};

const getPublicDashboardDataLocal = async () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const activeCranes = await getAllActiveCranes();
    const todayMovements = await db.movements.where('timestamp').above(startOfDay).toArray();
    const recentWorkshop = await db.workshopRecords.where('timestamp').above(threeDaysAgo).reverse().toArray();

    const opSummary: Record<string, number> = {};
    const craneSummary: Record<string, number> = {};
    const clientSummary: Record<string, number> = {};
    const yardSummary: Record<string, number> = {};

    todayMovements.forEach(m => {
        opSummary[m.operator] = (opSummary[m.operator] || 0) + 1;
        craneSummary[m.crane] = (craneSummary[m.crane] || 0) + 1;
        if (m.client) clientSummary[m.client] = (clientSummary[m.client] || 0) + 1;
        yardSummary[m.yard] = (yardSummary[m.yard] || 0) + 1;
    });

    const allMovements = await db.movements.toArray();
    const allUsages = await db.craneUsages.toArray();
    const allSessions = await db.sessions.toArray();
    const allFailures = await db.craneFailures.toArray();
    const appConfig = await getAppConfig();
    const cranesConfig = appConfig.CRANES || [];

    const extended = computeExtendedDashboardStats(allMovements, allFailures, cranesConfig);

    return { 
        activeCranes, 
        opSummary, 
        craneSummary, 
        clientSummary, 
        yardSummary, 
        recentWorkshop,
        allMovements,
        allUsages,
        allSessions,
        ...extended
    };
};

export const updateAppConfig = async (key: AppConfigKey, values: string[]): Promise<void> => {
    await db.appConfig.put({ key, values });
    try {
        await setDoc(doc(fdb, 'appConfig', key), { values });
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `appConfig/${key}`);
    }
}

export const getPendingSyncCount = async () => await db.syncQueue.count();

export const addMaintenanceReport = async (report: Omit<MaintenanceReport, "id">): Promise<number> => {
    const id = await db.maintenanceReports.add(report as MaintenanceReport);
    
    // Meter en la cola de sincronización con event_type: "REPORTE_FALLA"
    const syncPayload = {
        event_type: "REPORTE_FALLA",
        ...report,
        FECHA: report.fecha,
        HORA: report.hora,
        JORNADA: 'MANTENIMIENTO',
        ACCION: 'REPORTE_FALLA',
        OPERADOR: report.operador,
        GRUA: report.grua,
        PREDIO: '',
        CLIEN: '',
        CONTENE: '',
        MOTIVO: 'Reporte de Falla',
        comentarios_falla: report.descripcion,
        HORÓMETRO: ''
    };
    
    await enqueueSync(syncPayload as any);
    
    // Sincronizar a Firestore
    try {
        const reportRef = doc(fdb, 'maintenanceReports', id.toString());
        await setDoc(reportRef, {
            ...report,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error syncing maintenance report to Firestore:", e);
    }
    
    return id;
};

export const getCraneInspectionByUsageId = async (craneUsageId: number): Promise<CraneInspection | undefined> => {
    return await db.craneInspections.where('craneUsageId').equals(craneUsageId).first();
};

export const addCraneInspection = async (inspection: Omit<CraneInspection, 'id'>): Promise<number> => {
    const id = await db.craneInspections.add(inspection as CraneInspection);
    const now = new Date(inspection.timestamp);
    const session = await db.sessions.get(inspection.sessionId);

    // Build defect description lists with score < 4 to include in comments/issues
    const defects: string[] = [];
    const fieldsToInspect: { key: keyof Omit<CraneInspection, 'id' | 'sessionId' | 'craneUsageId' | 'timestamp' | 'crane' | 'operator' | 'fugaDetectada' | 'tipoFuga' | 'ubicacionFuga' | 'otroDetalleFuga' | 'reingresoBypass'>; label: string }[] = [
        { key: 'frenos', label: 'Frenos' },
        { key: 'frenoEstacionamiento', label: 'Freno de estacionamiento' },
        { key: 'alarmasBocina', label: 'Alarmas/Bocina' },
        { key: 'llantaDelanteraIzqExt', label: 'Llanta delantera izquierda exterior' },
        { key: 'llantaDelanteraIzqInt', label: 'Llanta delantera izquierda interior' },
        { key: 'llantaDelanteraDerExt', label: 'Llanta delantera derecha exterior' },
        { key: 'llantaDelanteraDerInt', label: 'Llanta delantera derecha interior' },
        { key: 'llantaTraseraIzquierda', label: 'Llanta trasera izquierda' },
        { key: 'llantaTraseraDerecha', label: 'Llanta trasera derecha' },
        { key: 'boom', label: 'Boom' },
        { key: 'spreader', label: 'Spreader' },
        { key: 'sideShift', label: 'Side Shift' },
        { key: 'lucesTrabajo', label: 'Luces Trabajo' },
        { key: 'luzSemaforo', label: 'Luz Semáforo' },
        { key: 'direccionales', label: 'Direccionales' },
        { key: 'lucesFreno', label: 'Luces Freno' },
        { key: 'lucesFrontales', label: 'Luces Frontales' },
        { key: 'fajas', label: 'Fajas' },
        { key: 'tornamesa', label: 'Tornamesa' },
        { key: 'manguerasVisibles', label: 'Mangueras Visibles' },
        { key: 'ac', label: 'A/C' },
        { key: 'abanicos', label: 'Abanicos' },
        { key: 'asiento', label: 'Asiento' },
        { key: 'parabrisas', label: 'Parabrisas' },
        { key: 'radio', label: 'Radio' }
    ];

    fieldsToInspect.forEach(item => {
        const val = (inspection as any)[item.key];
        if (val === 3) defects.push(`${item.label} (MENOR)`);
        else if (val === 2) defects.push(`${item.label} (MAYOR)`);
        else if (val === 1) defects.push(`${item.label} (CRÍTICO)`);
    });

    if (inspection.fugaDetectada === 'Sí') {
        const leakInfo = `Fuga [${inspection.tipoFuga}] en [${inspection.ubicacionFuga}]${inspection.otroDetalleFuga ? ` - ${inspection.otroDetalleFuga}` : ''}`;
        defects.push(leakInfo);
    }

    const defectText = inspection.reingresoBypass
        ? "REINGRESO RÁPIDO (Cierre accidental - Inspección ya realizada previamente)"
        : (defects.length > 0 ? `Defectos: ${defects.join(', ')}` : 'Todo Bien');

    // Sync to Google Sheets
    await enqueueSync({
        FECHA: now.toLocaleDateString(),
        HORA: formatTime24h(now),
        JORNADA: session?.workType || '',
        ACCION: 'INSPECCION_GRUAS',
        OPERADOR: inspection.operator,
        GRUA: inspection.crane,
        PREDIO: '',
        CLIEN: session?.client || '',
        CONTENE: '',
        MOTIVO: 'Pre-inspección Obligatoria',
        comentarios_falla: defectText,
        HORÓMETRO: ''
    });

    // Sync to Firestore
    try {
        const ref = doc(fdb, 'craneInspections', id.toString());
        await setDoc(ref, {
            ...inspection,
            timestamp: Timestamp.fromDate(now)
        });
    } catch (e) {
        console.error("Error syncing crane inspection to Firestore:", e);
    }

    // Generate failures automatically if not a bypass re-entry
    if (!inspection.reingresoBypass) {
        for (const item of fieldsToInspect) {
            const val = (inspection as any)[item.key];
            if (val !== undefined && val < 4) {
                // Determine severity
                let severity: 'Menor' | 'Mayor' | 'Crítico' = 'Menor';
                if (val === 1) severity = 'Crítico';
                else if (val === 2) severity = 'Mayor';

                // Check duplicates (avoid duplicate reports)
                const existing = await db.craneFailures
                    .where('crane').equals(inspection.crane)
                    .and(f => f.itemKey === item.key && f.status !== 'Resuelto')
                    .first();

                if (!existing) {
                    await addManualCraneFailure({
                        sessionId: inspection.sessionId,
                        craneUsageId: inspection.craneUsageId,
                        crane: inspection.crane,
                        operator: inspection.operator,
                        itemKey: item.key,
                        itemLabel: item.label,
                        score: val,
                        severity,
                        status: 'Pendiente'
                    });
                }
            }
        }

        // Handle Leak failure specifically
        if (inspection.fugaDetectada === 'Sí') {
            const existingLeak = await db.craneFailures
                .where('crane').equals(inspection.crane)
                .and(f => f.itemKey === 'fugaDetectada' && f.status !== 'Resuelto')
                .first();

            if (!existingLeak) {
                await addManualCraneFailure({
                    sessionId: inspection.sessionId,
                    craneUsageId: inspection.craneUsageId,
                    crane: inspection.crane,
                    operator: inspection.operator,
                    itemKey: 'fugaDetectada',
                    itemLabel: `Fuga de aceite [${inspection.tipoFuga || 'Grave'}] en [${inspection.ubicacionFuga || 'General'}]`,
                    score: 1, // critical
                    severity: 'Crítico',
                    status: 'Pendiente'
                });
            }
        }
    }

    return id;
};

export const subscribeToCraneFailures = (callback: (failures: CraneFailure[]) => void) => {
    return onSnapshot(collection(fdb, 'craneFailures'), async (snapshot) => {
        const list: CraneFailure[] = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const failure: CraneFailure = {
                ...data,
                id: Number(docSnap.id),
                timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
                firstReportedAt: data.firstReportedAt instanceof Timestamp ? data.firstReportedAt.toDate() : (data.firstReportedAt ? new Date(data.firstReportedAt) : undefined),
                resolvedAt: data.resolvedAt instanceof Timestamp ? data.resolvedAt.toDate() : (data.resolvedAt ? new Date(data.resolvedAt) : undefined),
                history: data.history ? data.history.map((h: any) => ({
                    ...h,
                    timestamp: h.timestamp instanceof Timestamp ? h.timestamp.toDate() : new Date(h.timestamp)
                })) : []
            } as CraneFailure;
            list.push(failure);
            await db.craneFailures.put(failure);
        }
        callback(list);
    }, (error) => {
        console.error("Error subscribing to craneFailures:", error);
    });
};

export const getCraneFailures = async (): Promise<CraneFailure[]> => {
    return await db.craneFailures.toArray();
};

export const updateCraneFailure = async (id: number, updates: Partial<CraneFailure>): Promise<void> => {
    const existing = await db.craneFailures.get(id);
    const merged = { ...existing, ...updates };

    await db.craneFailures.put(merged as CraneFailure);

    try {
        const ref = doc(fdb, 'craneFailures', id.toString());
        await setDoc(ref, {
            ...merged,
            timestamp: merged.timestamp ? Timestamp.fromDate(new Date(merged.timestamp)) : serverTimestamp(),
            firstReportedAt: merged.firstReportedAt ? Timestamp.fromDate(new Date(merged.firstReportedAt)) : null,
            resolvedAt: merged.resolvedAt ? Timestamp.fromDate(new Date(merged.resolvedAt)) : null,
            history: merged.history ? merged.history.map(h => ({
                ...h,
                timestamp: Timestamp.fromDate(new Date(h.timestamp))
            })) : []
        });
    } catch (e) {
        console.error("Error updating crane failure in Firestore:", e);
    }
};

export const addManualCraneFailure = async (failure: Omit<CraneFailure, 'id' | 'timestamp'>): Promise<number> => {
    const now = new Date();
    const history = failure.history || [{
        timestamp: now,
        operator: failure.operator,
        type: 'reported',
        status: failure.status || 'Pendiente',
        note: failure.itemLabel
    }];

    const record = {
        ...failure,
        timestamp: now,
        firstReportedAt: failure.firstReportedAt || now,
        history,
        status: failure.status || 'Pendiente'
    } as CraneFailure;

    const id = await db.craneFailures.add(record);
    record.id = id;

    try {
        const ref = doc(fdb, 'craneFailures', id.toString());
        await setDoc(ref, {
            ...record,
            timestamp: Timestamp.fromDate(now),
            firstReportedAt: Timestamp.fromDate(record.firstReportedAt!),
            history: record.history!.map(h => ({
                ...h,
                timestamp: Timestamp.fromDate(new Date(h.timestamp))
            }))
        });
    } catch (e) {
        console.error("Error syncing manual crane failure to Firestore:", e);
    }

    return id;
};

export const subscribeToAppConfig = (callback: (config: Record<AppConfigKey, string[]>) => void) => {
    // 1. Cargo de inmediato la configuración local de Dexie para que la UI se pinte enseguida (offline-first)
    getAppConfig().then(localConfig => {
        if (localConfig && Object.values(localConfig).some(arr => arr.length > 0)) {
            callback(localConfig);
        }
    }).catch(err => {
        console.error("Error cargando configuración local de Dexie:", err);
    });

    // 2. Suscribirse a Firestore para sincronizar cambios en tiempo real
    return onSnapshot(collection(fdb, 'appConfig'), async (snapshot) => {
        if (snapshot.empty) {
            const fallback = await getAppConfig();
            callback(fallback);
            return;
        }

        const localConfig = await getAppConfig();
        const config: Record<AppConfigKey, string[]> = { ...localConfig };
        let hasChanges = false;

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data && data.values && Array.isArray(data.values) && data.values.length > 0) {
                config[doc.id as AppConfigKey] = data.values;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data && data.values && Array.isArray(data.values) && data.values.length > 0) {
                    await db.appConfig.put({ key: doc.id as AppConfigKey, values: data.values });
                }
            }
            callback(config);
        } else {
            callback(localConfig);
        }
    }, (error) => {
        console.error("Error subscribing to appConfig from Firestore:", error);
    });
};

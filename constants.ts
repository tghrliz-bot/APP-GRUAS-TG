
export const ADMIN_USER = "Admin";

export const INITIAL_OPERATORS = [
  "Johnny Lizano", "Danny Arroyo", 
  "Erick Corso", "Denzel Brown", "Abel Grant", "Leonel Corzo", "Ricardo Rodriguez", "Prueba", ADMIN_USER
];

export const INITIAL_SHIFTS = ["Diurno", "Mixto", "Nocturno"];

export const INITIAL_WORK_TYPES = ["Jornada Normal", "Operación de Barco"];

export const INITIAL_CRANES = ["5 Taylor", "3 Kalmar", "4 Kalmar", "2 Terex", "1 Sisu"];

export const INITIAL_YARDS = ["PREDIO_3", "PREDIO_2", "PREDIO_1"];

export const INITIAL_CLIENTS = [
  "Orsero", "Marfret", "Seacat", "Silversea", 
  "Maersk", "Chiquita", "Triton", "T Grant", "Otro"
];

export const INITIAL_MOVEMENT_REASONS = [
  "Recepción", "Despacho", "Re-estibas", 
  "Cambios de chasis", "Revisión en Racks", "Taller", "Otro"
];

export const INITIAL_CRANE_CHANGE_REASONS = [
  "Falla mecánica", "Cambio Predio", "Suministro de Diesel", "Bajo Diesel"
];

export interface CraneRef {
  name: string;
  keys: string[];
  value: number;
}

export const CRANE_REFS: CraneRef[] = [
  { name: '4 Kalmar', keys: ['4 kalmar', 'kalmar 4', 'kalmar4', '4k'], value: 8162.50 },
  { name: '3 Kalmar', keys: ['3 kalmar', 'kalmar 3', 'kalmar3', '3k'], value: 3055.00 },
  { name: '5 Taylor', keys: ['5 taylor', 'taylor 5', 'taylor', '5t'], value: 31603.50 },
  { name: '2 Terex', keys: ['2 terex', 'terex 2', 'terex', '2t'], value: 4378.20 },
  { name: '1 Sisu', keys: ['1 sisu', 'sisu 1', 'sisu', '1s'], value: 1.00 }
];

export function getCraneWarning(selectedCraneName: string, val: number): { targetName: string; refVal: number } | null {
  const normSelected = selectedCraneName.toLowerCase();
  const selectedRef = CRANE_REFS.find(ref => 
    ref.keys.some(key => normSelected.includes(key))
  );

  if (selectedRef) {
    const selectedDist = Math.abs(val - selectedRef.value);
    
    for (const ref of CRANE_REFS) {
      if (ref.name !== selectedRef.name) {
        const otherDist = Math.abs(val - ref.value);
        const threshold = Math.max(100, ref.value * 0.10);
        if (otherDist < threshold && selectedDist > otherDist) {
          return { targetName: ref.name, refVal: ref.value };
        }
      }
    }

    if (selectedDist > 1500) {
      return { targetName: selectedRef.name, refVal: selectedRef.value };
    }
  } else {
    for (const ref of CRANE_REFS) {
      const otherDist = Math.abs(val - ref.value);
      const threshold = Math.max(100, ref.value * 0.10);
      if (otherDist < threshold) {
        return { targetName: ref.name, refVal: ref.value };
      }
    }
  }

  return null;
}


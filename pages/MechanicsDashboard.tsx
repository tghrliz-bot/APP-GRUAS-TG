import React, { useState, useEffect } from 'react';
import { CraneFailure, AppConfigKey } from '../types';
import { getCraneFailures, updateCraneFailure, addManualCraneFailure, getAppConfig, subscribeToCraneFailures } from '../services/db';
import { getAIDiagnosis } from '../services/ai';
import { 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  PlusCircle, 
  Filter, 
  ExternalLink, 
  X, 
  AlertOctagon, 
  ChevronRight, 
  Info,
  Calendar,
  Layers,
  ArrowLeft,
  Sparkles,
  Bot
} from 'lucide-react';

interface MechanicsDashboardProps {
  onBack: () => void;
}

// Preset operational rules provided by user
const CRANE_GUIDES = [
  {
    crane: '2 TEREX',
    status: 'Es la grúa con menos reportes en el patio este mes, pero mantiene sus alertas críticas activas.',
    critical: [
      'Fuga de aceite (cabina / joystick)',
      'Golpes en caja de cambios (transmisión)',
      'Mangueras reventadas (riesgo de varada)',
      'Freno de estacionamiento (¡Reportado por Danny Arroyo!)'
    ],
    recurrent: [
      'Radio de comunicación dañado',
      'Aire Acondicionado (A/C) no funciona',
      'Luces con fallas y llantas desgastadas'
    ]
  },
  {
    crane: '3 KALMAR',
    status: '¡Alerta Máxima! Ha tenido un mes crítico con el sistema de frenos y fugas. Los operadores reportan que se está trabajando de manera peligrosa.',
    critical: [
      'Fugas de líquido en frenos / llanta delantera: (Falla masiva repetida por Danny los días 4, 6 y 13 de mayo, y confirmada por Johnny con "frenos de pie a destiempo" el 9 de junio)',
      'Freno de estacionamiento dañado: (Múltiples reportes en mayo)',
      'Uso obligatorio de By-pass en sensores: (¡Reportado por Johnny Lizano el 2 de junio! La máquina está trabajando puenteada por soportes caídos en la cadena del boom)',
      'Problemas de marcha y transmisión / Tornamesa inestable'
    ],
    recurrent: [
      'Ergonomía: Asiento severamente desgastado (Johnny reporta molestias fuertes de espalda)',
      'Goteo leve pero constante de aceite por abajo y atrás del boom',
      'A/C y Radio de comunicación inoperativos en el 100% de los turnos',
      'Llantas desgastadas y entrampe fallando',
      'Nuevo: Sonido extraño en los pistones al subir (12 de junio)'
    ]
  },
  {
    crane: '4 KALMAR',
    status: 'Problema severo y crónico en el sistema hidráulico del Spreader y fugas de refrigerante en el motor.',
    critical: [
      'Pistón del Boom / Spreader excesivamente lento para recoger: (Reportado casi a diario por Danny durante mayo y junio. La máquina pierde velocidad drásticamente cuando trabaja caliente)',
      'Fuga de agua constante en el motor: (Reportado más de 15 veces seguidas. Riesgo inminente de soplado de empaque)',
      'Fuga de aceite severa en el pistón derecho del Boom: (Reportado por Johnny a finales de mayo y junio, acompañado de ruidos fuertes al subir)',
      'Bloqueos repentinos del sistema: (Reportado el 21 de mayo, obliga a apagar y encender la máquina para resetearla. El 6 de junio la máquina no generó y no arrancó, requiriendo cambio de grúa con horómetro en 8.156,90)',
      'Spreader se balancea (sin freno)'
    ],
    recurrent: [
      'Vidrio de la cabina reventado/quebrado (afecta visibilidad)',
      'Luz del twistlock (o trolock) derecho quemada (afecta operación nocturna)',
      'Llantas desgastadas y goteo de aceite inferior'
    ]
  },
  {
    crane: '5 TAYLOR',
    status: 'Esta máquina está sufriendo un desgaste severo en sus componentes mecánicos principales (Transmisión y Motor). Entró a revisión constante de horómetros (rango 31.346 a 31.603).',
    critical: [
      'Bloqueos totales de la máquina: (Varada el 17 de mayo y el 2 de junio, requiriendo grúa de sustitución)',
      'Golpes fuertes en la caja de cambios / transmisión: (Alerta roja detectada por Danny el 18 de mayo. Entró a revisión técnica)',
      'Falla total de la Tornamesa (No gira): (Reportado por Denzel Brown con cambio de grúa el 5 de mayo)',
      'Fugas múltiples de agua y aceite (Presenta sobrecalentamiento)',
      'Falla del sistema eléctrico del Semáforo: (La luz verde está totalmente quemada o da falso contacto, apagando todo el panel por ratos)'
    ],
    recurrent: [
      'Entrampe no funciona: (Reportado de forma unánime en casi todos los turnos del mes)',
      'Fajas del motor chillando / sonando fuerte: (Nueva falla recurrente en junio)',
      'Freno de estacionamiento deficiente y luces generales con fallas',
      'Vidrios de la cabina totalmente reventados/quebrados',
      'Llanta trasera derecha se desinfla constantemente en el patio'
    ]
  }
];

export default function MechanicsDashboard({ onBack }: MechanicsDashboardProps) {
  const [failures, setFailures] = useState<CraneFailure[]>([]);
  const [craneOptions, setCraneOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'RESOLVED' | 'GUIDES'>('ACTIVE');
  
  // Filtering states
  const [selectedCraneFilter, setSelectedCraneFilter] = useState<string>('TODAS');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('TODOS');
  
  // Status editing modal / state
  const [editingFailure, setEditingFailure] = useState<CraneFailure | null>(null);
  const [mechanicName, setMechanicName] = useState('');
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [newStatus, setNewStatus] = useState<CraneFailure['status']>('En Reparación');
  const [justification, setJustification] = useState('');

  // Manual failure creation state
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualCrane, setManualCrane] = useState('');
  const [manualItemLabel, setManualItemLabel] = useState('');
  const [manualSeverity, setManualSeverity] = useState<'Menor' | 'Mayor' | 'Crítico'>('Mayor');
  const [manualOperator, setManualOperator] = useState('Mecánico de Turno');
  const [manualError, setManualError] = useState('');
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);

  // AI Diagnosis state
  const [aiModal, setAiModal] = useState<{
    open: boolean;
    loading: boolean;
    crane: string;
    label: string;
    analysis: string | null;
    error: string | null;
  }>({
    open: false,
    loading: false,
    crane: '',
    label: '',
    analysis: null,
    error: null,
  });

  const handleRequestAIDiagnosis = async (failure: CraneFailure) => {
    setAiModal({
      open: true,
      loading: true,
      crane: failure.crane,
      label: failure.itemLabel,
      analysis: null,
      error: null,
    });

    try {
      const res = await getAIDiagnosis(failure.crane, failure.itemLabel, failure.history);
      if (res.success && res.analysis) {
        setAiModal(prev => ({ ...prev, loading: false, analysis: res.analysis }));
      } else {
        setAiModal(prev => ({ ...prev, loading: false, error: res.error || 'No se pudo generar el diagnóstico con IA.' }));
      }
    } catch (err: any) {
      setAiModal(prev => ({ ...prev, loading: false, error: err.message || 'Error al conectar con la IA.' }));
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToCraneFailures((list) => {
      setFailures(list);
    });

    const loadConfig = async () => {
      try {
        const config = await getAppConfig();
        if (config) {
          if (config.CRANES) {
            setCraneOptions(config.CRANES);
            if (config.CRANES.length > 0) {
              setManualCrane(config.CRANES[0]);
            }
          }
          if (config.OPERATORS) {
            setOperatorOptions(config.OPERATORS);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();

    return () => {
      unsubscribe();
    };
  }, []);

  // Helper to seed sample failures if the database is completely empty
  const handleSeedSamples = async () => {
    setLoading(true);
    try {
      const samples: Omit<CraneFailure, 'id' | 'timestamp'>[] = [
        {
          sessionId: 0,
          craneUsageId: 0,
          crane: '2 TEREX',
          operator: 'R. Fonseca',
          itemKey: 'fugaDetectada',
          itemLabel: 'Fuga de aceite severa en manguera de joystick',
          score: 1,
          severity: 'Crítico',
          status: 'Pendiente'
        },
        {
          sessionId: 0,
          craneUsageId: 0,
          crane: '3 KALMAR',
          operator: 'A. Rojas',
          itemKey: 'frenoEstacionamiento',
          itemLabel: 'Freno de estacionamiento no retiene el equipo',
          score: 1,
          severity: 'Crítico',
          status: 'En Reparación',
          mechanicNotes: 'Revisando pastillas de freno en taller',
          resolvedBy: 'Luis (Taller)'
        },
        {
          sessionId: 0,
          craneUsageId: 0,
          crane: '4 KALMAR',
          operator: 'J. Mora',
          itemKey: 'spreader',
          itemLabel: 'Spreader se balancea lateralmente en exceso',
          score: 1,
          severity: 'Crítico',
          status: 'Pendiente'
        },
        {
          sessionId: 0,
          craneUsageId: 0,
          crane: 'TAYLOR',
          operator: 'M. Vega',
          itemKey: 'ac',
          itemLabel: 'A/C no enfría absolutamente nada',
          score: 3,
          severity: 'Menor',
          status: 'Pendiente'
        },
        {
          sessionId: 0,
          craneUsageId: 0,
          crane: '2 TEREX',
          operator: 'R. Fonseca',
          itemKey: 'lucesTrabajo',
          itemLabel: 'Foco reflector trasero quemado',
          score: 3,
          severity: 'Menor',
          status: 'Resuelto',
          resolvedAt: new Date(Date.now() - 3600000 * 2),
          mechanicNotes: 'Se reemplazó lámpara externa de 24V',
          resolvedBy: 'Carlos Gómez'
        }
      ];

      for (const sample of samples) {
        await addManualCraneFailure(sample);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Logic to handle saving status changes
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFailure || !editingFailure.id) return;

    try {
      const now = new Date();
      const operatorName = mechanicName.trim() || 'Mecánico de Turno';
      
      const newHistoryItem = {
        timestamp: now,
        operator: operatorName,
        type: 'status_change' as const,
        status: newStatus,
        note: `Estado cambiado a [${newStatus}]. Acción: ${mechanicNotes.trim() || 'Actualización de taller.'} ${newStatus === 'No Reparado' ? `Justificación del motivo: ${justification.trim()}` : ''}`
      };

      const updatedHistory = [...(editingFailure.history || []), newHistoryItem];

      const updates: Partial<CraneFailure> = {
        status: newStatus,
        mechanicNotes: mechanicNotes,
        resolvedBy: operatorName,
        resolvedAt: newStatus === 'Resuelto' ? now : undefined,
        history: updatedHistory,
        justification: newStatus === 'No Reparado' ? justification : undefined
      };

      await updateCraneFailure(editingFailure.id, updates);
      setEditingFailure(null);
      setMechanicNotes('');
      setMechanicName('');
      setJustification('');
    } catch (err) {
      console.error(err);
    }
  };

  // Logic to save a manually entered failure
  const handleSaveManualFailure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItemLabel.trim()) {
      setManualError('Indique la descripción o componente de la falla.');
      return;
    }

    try {
      const record: Omit<CraneFailure, 'id' | 'timestamp'> = {
        sessionId: -1,
        craneUsageId: -1,
        crane: manualCrane,
        operator: manualOperator,
        itemKey: 'manual_report',
        itemLabel: manualItemLabel,
        score: manualSeverity === 'Crítico' ? 1 : (manualSeverity === 'Mayor' ? 2 : 3),
        severity: manualSeverity,
        status: 'Pendiente',
        isCustomManualReport: true
      };

      await addManualCraneFailure(record);
      setManualItemLabel('');
      setShowAddManual(false);
      setManualError('');
    } catch (err) {
      console.error(err);
      setManualError('Error al registrar la falla.');
    }
  };

  // Compute stats helper
  const filteredFailures = failures.filter(f => {
    const matchesCrane = selectedCraneFilter === 'TODAS' || f.crane === selectedCraneFilter;
    const matchesSeverity = selectedSeverityFilter === 'TODOS' || f.severity === selectedSeverityFilter;
    const matchesTabStatus = activeTab === 'ACTIVE' ? f.status !== 'Resuelto' : f.status === 'Resuelto';
    return matchesCrane && matchesSeverity && matchesTabStatus;
  });

  // Calculate stats for Active context
  const activeCount = failures.filter(f => f.status !== 'Resuelto').length;
  const criticalCount = failures.filter(f => f.status !== 'Resuelto' && f.severity === 'Crítico').length;
  const inRepairCount = failures.filter(f => f.status === 'En Reparación').length;

  // Compute repeated components to see what fails the most
  const componentRepeats = () => {
    const tallies: Record<string, { label: string; count: number; cranes: Set<string> }> = {};
    failures.forEach(f => {
      // Clean target name slightly
      const key = f.itemLabel.split('[')[0].trim();
      if (!tallies[key]) {
        tallies[key] = { label: key, count: 0, cranes: new Set() };
      }
      tallies[key].count += 1;
      tallies[key].cranes.add(f.crane);
    });
    return Object.values(tallies)
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);
  };

  const getDaysElapsed = (dateInput: any) => {
    if (!dateInput) return 0;
    const date = new Date(dateInput);
    const diffTime = Math.abs(Date.now() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;
    return diffDays < 0 ? 0 : diffDays;
  };

  const getGroupedActiveFailures = () => {
    const groups: Record<string, { crane: string; list: CraneFailure[]; highestSeverity: string; maxDays: number; firstReportDate: Date; operators: Set<string> }> = {};
    
    filteredFailures.forEach(f => {
      if (!groups[f.crane]) {
        groups[f.crane] = {
          crane: f.crane,
          list: [],
          highestSeverity: 'Menor',
          maxDays: 0,
          firstReportDate: new Date(f.timestamp),
          operators: new Set()
        };
      }
      
      groups[f.crane].list.push(f);
      groups[f.crane].operators.add(f.operator);
      
      const days = getDaysElapsed(f.timestamp);
      if (days > groups[f.crane].maxDays) {
        groups[f.crane].maxDays = days;
      }
      
      const thisDate = new Date(f.timestamp);
      if (thisDate < groups[f.crane].firstReportDate) {
        groups[f.crane].firstReportDate = thisDate;
      }
      
      const currentHighest = groups[f.crane].highestSeverity;
      if (f.severity === 'Crítico' || currentHighest === 'Crítico') {
        groups[f.crane].highestSeverity = 'Crítico';
      } else if (f.severity === 'Mayor' || currentHighest === 'Mayor') {
        groups[f.crane].highestSeverity = 'Mayor';
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      if (a.highestSeverity === 'Crítico' && b.highestSeverity !== 'Crítico') return -1;
      if (a.highestSeverity !== 'Crítico' && b.highestSeverity === 'Crítico') return 1;
      return b.maxDays - a.maxDays;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 md:p-6 pb-20 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Layout */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-amber-400">
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-amber-400 tracking-tight italic uppercase">Módulo de Mantenimiento</h1>
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Planificación y Reparación de Equipos</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddManual(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Reportar Falla</span>
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
          </div>
        </header>

        {/* Dynamic Warning Alert for Critical Unresolved Failures */}
        {criticalCount > 0 && (
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 flex gap-3.5 items-center">
            <div className="w-10 h-10 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-xs font-black uppercase text-red-400 tracking-wide">Fallas Críticas Pendientes Detectadas ({criticalCount})</h4>
              <p className="text-[11px] text-slate-300 font-medium">
                Hay {criticalCount} reportes críticos pendientes que requieren atención inmediata de taller para evitar paradas operativas y riesgos de seguridad.
              </p>
            </div>
          </div>
        )}

        {/* Operational Stats Row */}
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fallas Activas</span>
            <span className="text-3xl font-black text-amber-400 mt-2">{activeCount}</span>
            <span className="text-[9px] text-slate-500 mt-1 uppercase font-bold">Por atender</span>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En Reparación</span>
            <span className="text-3xl font-black text-orange-400 mt-2">{inRepairCount}</span>
            <span className="text-[9px] text-slate-500 mt-1 uppercase font-bold">Turnadas a taller</span>
          </div>
          <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Críticas Activas</span>
            <span className="text-3xl font-black text-rose-500 mt-2">{criticalCount}</span>
            <span className="text-[9px] text-red-400/60 mt-1 uppercase font-bold">Riesgo Alto</span>
          </div>
        </section>

        {/* View Mode Tabs */}
        <section className="border-b border-slate-800 flex gap-1">
          <button
            onClick={() => { setActiveTab('ACTIVE'); setSelectedCraneFilter('TODAS'); }}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'ACTIVE' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            📋 Fallas Activas ({activeCount})
          </button>
          <button
            onClick={() => { setActiveTab('RESOLVED'); setSelectedCraneFilter('TODAS'); }}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'RESOLVED' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            ✅ Reparadas / Resueltas
          </button>
          <button
            onClick={() => setActiveTab('GUIDES')}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'GUIDES' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            📖 Guías de Fallas
          </button>
        </section>

        {activeTab === 'GUIDES' ? (
          /* Operational Guides Section */
          <div className="space-y-4">
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-2">Manual Rápido de Diagnóstico por Equipo</h3>
              <p className="text-[11px] text-slate-350 leading-relaxed uppercase font-bold">
                A continuación se listan las fallas operarias e históricas pre-clasificadas que ocurren con más frecuencia en cada tipo de grúa. Úselas para guiar el orden de trabajo.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CRANE_GUIDES.map(guide => (
                <div key={guide.crane} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-sm font-black text-orange-400 tracking-tight italic">{guide.crane}</h4>
                    <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md font-bold uppercase">Manual de Referencia</span>
                  </div>

                  {guide.status && (
                    <div className="bg-slate-950/45 p-2.5 rounded-lg border border-slate-850">
                      <span className="text-[8px] font-black text-amber-500/90 uppercase tracking-widest block mb-0.5">⚠️ Estado General:</span>
                      <p className="text-[10px] text-zinc-300 font-bold leading-normal uppercase">{guide.status}</p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-1">🚨 Fallas Críticas (Parada Obligatoria):</span>
                      <ul className="space-y-1 pl-2 text-[10px] text-slate-300 list-disc font-bold uppercase leading-tight">
                        {guide.critical.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="pt-1.5 border-t border-slate-800/50">
                      <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest block mb-1">🟡 Fallas Recurrentes (Seguimiento Continuo):</span>
                      <ul className="space-y-1 pl-2 text-[10px] text-slate-400 list-disc font-bold uppercase leading-tight">
                        {guide.recurrent.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Active vs Resolved Failures View */
          <div className="space-y-4">
            
            {/* Failures Analysis and Grouping Panel */}
            {activeTab === 'ACTIVE' && failures.length > 0 && (
              <div className="bg-slate-900/30 border border-slate-850 rounded-xl p-4.5 space-y-3">
                <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <Layers className="text-amber-400 w-4 h-4" />
                  <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">Análisis: Fallas más Repetidas</h4>
                </div>
                {componentRepeats().length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">No hay suficientes reportes para calcular tendencias.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      {componentRepeats().map((repeat, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg text-[10px] border border-slate-800">
                          <div className="font-bold text-slate-300 uppercase line-clamp-1 max-w-[70%]">
                            <span className="text-amber-500 font-extrabold mr-1">#{idx + 1}</span>
                            {repeat.label}
                          </div>
                          <div className="flex gap-2 items-center">
                            <span className="text-slate-450 font-medium">Grúas: {Array.from(repeat.cranes).join(', ')}</span>
                            <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded-sm font-black">{repeat.count} rep.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-3.5 bg-slate-900/50 rounded-lg space-y-1.5 text-[10px] font-bold text-slate-400 uppercase leading-relaxed border border-slate-800">
                      <span className="text-amber-400 font-black block mb-1">🤖 AUTOMATIZACIÓN DE TALLER:</span>
                      <p>1. El sistema mapea cada inspección reprobada (&lt; 4) para evitar reportarla dos veces.</p>
                      <p>2. Cada grúa hereda un contador de días sin reparar. No deje tareas activas más de lo necesario.</p>
                      <p>3. Use las categorías preestablecidas para diagnosticar componentes.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters bar */}
            <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 uppercase font-black tracking-wider">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Filtrar:</span>
                </div>
                
                {/* Crane filter */}
                <select
                  value={selectedCraneFilter}
                  onChange={(e) => setSelectedCraneFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 px-2.5 py-1.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="TODAS">TODAS LAS GRÚAS</option>
                  {craneOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Severity filter */}
                <select
                  value={selectedSeverityFilter}
                  onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 px-2.5 py-1.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="TODOS">TODAS LAS SEVERIDADES</option>
                  <option value="Crítico">CRÍTICO 🔴</option>
                  <option value="Mayor">MAYOR 🟠</option>
                  <option value="Menor">MENOR 🟡</option>
                </select>
              </div>

              {failures.length === 0 && (
                <button
                  onClick={handleSeedSamples}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-black uppercase rounded-lg cursor-pointer"
                >
                  🌱 Generar Ejemplos Reales
                </button>
              )}
            </div>

            {/* List of failures */}
            {filteredFailures.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/20 border border-slate-800/60 rounded-2xl space-y-2">
                <p className="text-sm font-bold text-slate-500 uppercase">Sin registros de {activeTab === 'ACTIVE' ? 'fallas activas' : 'fallas resueltas'}</p>
                <p className="text-xs text-slate-600 uppercase">Ajuste los filtros de grúa o reporte una nueva falla manualmente.</p>
              </div>
            ) : activeTab === 'ACTIVE' ? (
              /* Grouped representation exactly like IMAGE 1 */
              <div className="space-y-6">
                {getGroupedActiveFailures().map((group, groupIdx) => {
                  const isCrit = group.highestSeverity === 'Crítico';
                  const isMay = group.highestSeverity === 'Mayor';
                  
                  return (
                    <div 
                      key={group.crane + '-' + groupIdx} 
                      className={`bg-slate-900 border-2 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl transition-all ${
                        isCrit ? 'border-red-600/40 bg-red-950/5 shadow-red-950/5' : 
                        isMay ? 'border-orange-500/20 bg-orange-950/5' : 
                        'border-slate-800'
                      }`}
                    >
                      {/* Top ribbon: priority, ID, Active pulse */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded font-black text-[9px] uppercase tracking-wider text-white ${
                            isCrit ? 'bg-red-600' : isMay ? 'bg-orange-600' : 'bg-yellow-500 text-slate-950'
                          }`}>
                            PRIORITY: {group.highestSeverity === 'Crítico' ? '🔴 CRÍTICA' : group.highestSeverity === 'Mayor' ? '🟠 MAYOR' : '🟡 MENOR'}
                          </span>
                          <span className="text-[9px] text-slate-500 font-extrabold uppercase">
                            ID: GP-{group.crane.replace(/\s+/g, '-').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                          <span className="text-[9px] text-rose-500 font-black uppercase tracking-widest">ACTIVO</span>
                        </div>
                      </div>

                      {/* Main Title Crane brand and exclamation marks */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                            {group.crane}
                            {isCrit && <span className="text-red-500 animate-pulse">⚠️ !!!</span>}
                          </h3>
                          <p className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider mt-0.5">
                            REPORTADO POR: <span className="text-slate-300 font-medium">{Array.from(group.operators).join(', ')}</span>
                          </p>
                        </div>
                        
                        <div className="text-right space-y-1">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">
                            📅 REPORTE: {group.firstReportDate.toLocaleDateString()}
                          </p>
                          <span className="inline-block bg-amber-450/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider">
                            ⏳ {group.maxDays === 0 ? '⚡ REPORTADA HOY' : `${group.maxDays} DÍAS SIN REPARAR`}
                          </span>
                        </div>
                      </div>

                      {/* Sub-section: Resumen de fallas */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-slate-450" />
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">⊞ RESUMEN DE FALLAS ACTIVAS:</span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2.5">
                          {group.list.map((failure) => {
                            const failDays = getDaysElapsed(failure.timestamp);
                            return (
                              <div 
                                key={failure.id} 
                                className={`bg-slate-950 border border-slate-850/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 ${
                                  failure.severity === 'Crítico' ? 'border-l-red-500 bg-red-955/10' : 
                                  failure.severity === 'Mayor' ? 'border-l-orange-500 bg-orange-955/10' : 
                                  'border-l-yellow-400 bg-yellow-955/10'
                                }`}
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-100 font-black uppercase text-xs sm:text-sm tracking-tight">{failure.itemLabel}</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-wider ${
                                      failure.severity === 'Crítico' ? 'bg-red-500/20 text-red-300' :
                                      failure.severity === 'Mayor' ? 'bg-orange-500/20 text-orange-300' :
                                      'bg-yellow-500/20 text-yellow-300'
                                    }`}>{failure.severity}</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-500 uppercase font-bold leading-none">
                                    <span>Estado: 
                                      <span className={`font-black ml-1 px-1 py-0.5 rounded ${
                                        failure.status === 'En Reparación' ? 'text-orange-400 bg-orange-500/10 animate-pulse' : 
                                        failure.status === 'Requiere Compra' ? 'text-amber-400 bg-amber-500/10' :
                                        failure.status === 'No Reparado' ? 'text-red-400 bg-red-500/10' :
                                        'text-rose-450 bg-rose-500/10'
                                      }`}>
                                        {failure.status === 'Resuelto' ? 'SOLUCIONADA' : failure.status?.toUpperCase() || 'PENDIENTE'}
                                      </span>
                                    </span>
                                    <span>•</span>
                                    <span>Por: {failure.operator}</span>
                                    {failDays > 0 && (
                                      <>
                                        <span>•</span>
                                        <span className="text-red-400 font-black">{failDays}d sin reparar</span>
                                      </>
                                    )}
                                  </div>

                                  {failure.status === 'No Reparado' && failure.justification && (
                                    <div className="text-[10px] bg-red-500/5 text-red-300 px-2.5 py-1.5 rounded-lg border border-red-500/20 uppercase font-semibold leading-relaxed mt-1">
                                      ⚠️ JUSTIFICACIÓN DE NO REPARACIÓN: {failure.justification}
                                    </div>
                                  )}

                                  {failure.history && failure.history.length > 1 && (
                                    <p className="text-[9px] text-amber-500/80 uppercase font-extrabold flex items-center gap-1 mt-1">
                                      🔄 Falla Recurrente: Reportada anteriormente {(failure.history.filter(h => h.type === 'recurrence') || []).length} veces.
                                    </p>
                                  )}
                                </div>

                                <div className="shrink-0 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRequestAIDiagnosis(failure)}
                                    className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-600 hover:text-white text-indigo-400 border border-indigo-500/30 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                                  >
                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                    <span>Diagnóstico IA</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFailure(failure);
                                      setNewStatus(failure.status || 'En Reparación');
                                      setMechanicName(failure.resolvedBy || '');
                                      setMechanicNotes(failure.mechanicNotes || '');
                                      setJustification(failure.justification || '');
                                    }}
                                    className="w-full sm:w-auto px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-550 hover:text-slate-950 text-emerald-400 hover:border-emerald-500 border border-emerald-500/30 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                                  >
                                    <Wrench className="w-3 h-3" />
                                    <span>Atender / Cambiar Estado</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Resolved view list */
              <div className="grid grid-cols-1 gap-3.5">
                {filteredFailures.map((failure) => {
                  return (
                    <div 
                      key={failure.id} 
                      className="bg-slate-900 border border-slate-800 transition-all rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-emerald-500"
                    >
                      {/* Left Block: Info details */}
                      <div className="space-y-2 max-w-full md:max-w-[70%]">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Crane Code */}
                          <span className="px-2.5 py-0.5 bg-slate-950 border border-slate-805 text-zinc-300 rounded font-black text-xs uppercase tracking-tight">
                            {failure.crane}
                          </span>
                          
                          {/* Severity Indicator */}
                          <button className="px-2 py-0.5 rounded font-black text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                            RESOLVIDO ✅
                          </button>

                          {/* Date details */}
                          <span className="text-[9px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(failure.timestamp).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Title block */}
                        <h4 className="text-sm font-black text-slate-200 uppercase tracking-wide leading-tight">
                          {failure.itemLabel}
                        </h4>

                        <div className="text-[10px] text-slate-450 font-semibold space-y-1 leading-snug">
                          <div className="space-y-0.5 text-[10px] uppercase">
                            <p className="font-bold text-slate-400">
                              Reparado por: <span className="font-extrabold text-emerald-400">{failure.resolvedBy || 'Taller'}</span> ({failure.resolvedAt ? new Date(failure.resolvedAt).toLocaleDateString() : 'N/D'})
                            </p>
                            {failure.mechanicNotes && (
                              <p className="font-bold text-slate-350 italic">
                                Nota del Taller: "{failure.mechanicNotes}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Editing / Updating status modal */}
        {editingFailure && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="text-amber-400 w-5 h-5 animate-spin duration-3000" />
                  <h3 className="text-sm font-black uppercase text-slate-200 tracking-tight italic">Registrar Reparación</h3>
                </div>
                <button 
                  onClick={() => setEditingFailure(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-500 uppercase">Equipo/Grúa:</span>
                  <span className="font-black text-amber-400 uppercase">{editingFailure.crane}</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/50">
                  <span className="font-bold text-slate-500 uppercase">Falla Reportada:</span>
                  <span className="font-extrabold text-slate-300 uppercase line-clamp-1">{editingFailure.itemLabel}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-slate-500 uppercase">Severidad original:</span>
                  <span className="font-black text-rose-500 uppercase">{editingFailure.severity}</span>
                </div>
              </div>

              <form onSubmit={handleSaveStatus} className="space-y-4">
                {/* Status selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-wider">Nuevo Estado</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewStatus('Resuelto')}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${newStatus === 'Resuelto' ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-black' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      ✅ SOLUCIONADA
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStatus('En Reparación')}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${newStatus === 'En Reparación' ? 'bg-orange-500 text-slate-950 border-orange-500 font-black' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      🛠️ EN REPARACIÓN
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStatus('Requiere Compra')}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${newStatus === 'Requiere Compra' ? 'bg-amber-500 text-slate-950 border-amber-500 font-black' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      🛒 REQUIERE COMPRA
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStatus('No Reparado')}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${newStatus === 'No Reparado' ? 'bg-rose-500 text-slate-950 border-rose-500 font-black' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      ⚠️ NO REPARADA
                    </button>
                  </div>
                </div>

                {/* Mechanic's Name input */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Nombre del Técnico mecánico</label>
                  <input
                    type="text"
                    required
                    value={mechanicName}
                    onChange={(e) => setMechanicName(e.target.value)}
                    placeholder="Ej. Luis Solano / Carlos Gómez"
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 px-3.5 py-2.5 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase transition-all"
                  />
                  <div className="flex gap-2 mt-1.5 justify-start">
                    <button
                      type="button"
                      onClick={() => setMechanicName('Erick Corzo')}
                      className="px-2.5 py-1 text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg uppercase tracking-wider border border-slate-700 transition cursor-pointer"
                    >
                      👤 Erick Corzo
                    </button>
                    <button
                      type="button"
                      onClick={() => setMechanicName('Leonel Corzo')}
                      className="px-2.5 py-1 text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg uppercase tracking-wider border border-slate-700 transition cursor-pointer"
                    >
                      👤 Leonel Corzo
                    </button>
                  </div>
                </div>

                {/* Justification of non-repair status */}
                {newStatus === 'No Reparado' && (
                  <div>
                    <label className="block text-[10px] font-black text-rose-400 uppercase mb-1 tracking-wider">Justificación del Motivo (Requerido)</label>
                    <textarea
                      rows={2}
                      required
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Justifique por qué no se ha reparado la falla (ej. grúa operando, repuestos agotados, etc.)..."
                      className="w-full bg-white text-zinc-950 border-2 border-slate-300 p-2.5 text-xs font-semibold rounded-xl outline-none focus:border-rose-500 uppercase leading-relaxed resize-none transition-all"
                    />
                  </div>
                )}

                {/* Mechanic's report notes */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Detalles de las Acciones / Correcciones realizadas</label>
                  <textarea
                    rows={3}
                    required={newStatus !== 'No Reparado'}
                    value={mechanicNotes}
                    onChange={(e) => setMechanicNotes(e.target.value)}
                    placeholder="Escriba los repuestos aplicados, ajustes de mangueras, carga de refrigerante, soldaduras realizadas..."
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 p-3 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase leading-relaxed resize-none transition-all"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingFailure(null)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Retroceder
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Guardar Taller
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Adding manual failure modal */}
        {showAddManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-400 w-5 h-5 animate-bounce" />
                  <h3 className="text-sm font-black uppercase text-slate-200 tracking-tight italic">Ingreso de Falla Directo</h3>
                </div>
                <button 
                  onClick={() => setShowAddManual(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveManualFailure} className="space-y-4">
                
                {/* Crane Selection */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Grúa Afectada</label>
                  <select
                    value={manualCrane}
                    onChange={(e) => setManualCrane(e.target.value)}
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 px-3.5 py-2.5 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase transition-all"
                  >
                    {craneOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Severity Selection */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Nivel de Severidad de Falla</label>
                  <select
                    value={manualSeverity}
                    onChange={(e) => setManualSeverity(e.target.value as any)}
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 px-3.5 py-2.5 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase transition-all"
                  >
                    <option value="Crítico">🔴 CRÍTICO (PARADA DE EQUIPO)</option>
                    <option value="Mayor">🟠 MAYOR (FUNCIONA CON REPROBACIÓN)</option>
                    <option value="Menor">🟡 MENOR (DETALLE ESTÉTICO / SEGUIMIENTO)</option>
                  </select>
                </div>

                {/* Component / Item details */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Detalle del Problema Detectado</label>
                  <input
                    type="text"
                    required
                    value={manualItemLabel}
                    onChange={(e) => setManualItemLabel(e.target.value)}
                    placeholder="Ej. Fuga de aceite de transmisión en el eje trasero"
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 px-3.5 py-2.5 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase transition-all"
                  />
                </div>

                {/* Operator (Manual reporter) */}
                {/* Operator Selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-wider">Reportado por (Operador o Inspector)</label>
                  <select
                    value={manualOperator}
                    onChange={(e) => setManualOperator(e.target.value)}
                    className="w-full bg-white text-zinc-950 border-2 border-slate-300 px-3.5 py-2.5 text-xs font-semibold rounded-xl outline-none focus:border-amber-500 uppercase transition-all"
                  >
                    <option value="Mecánico de Turno">🔧 MECÁNICO DE TURNO</option>
                    {(operatorOptions.length > 0 ? operatorOptions : ['Danny', 'Johnny', 'Denzel']).map(op => (
                      <option key={op} value={op}>👷 OPERADOR: {op}</option>
                    ))}
                  </select>
                </div>

                {manualError && (
                  <p className="text-[10px] font-black text-rose-500 text-center uppercase">{manualError}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddManual(false)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider animate-pulse hover:animate-none"
                  >
                    Registrar Falla
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

        {/* Modal: AI Diagnosis */}
        {aiModal.open && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl shadow-indigo-950/50 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                    <Sparkles className="w-5 h-5 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-indigo-300 tracking-tight">
                      Diagnóstico de Ingeniería IA
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase font-mono">
                      Modelo: Gemini 3.8 Flash • {aiModal.crane}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setAiModal(prev => ({ ...prev, open: false }))}
                  className="text-slate-500 hover:text-slate-300 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl space-y-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Falla / Reporte Evaluado:</span>
                <p className="text-xs font-bold text-slate-200 uppercase">{aiModal.label}</p>
              </div>

              {aiModal.loading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider animate-pulse">
                    Analizando falla con Gemini 3.8 Flash...
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">Evaluando causas raíz, riesgos mecánicos y acciones de taller</p>
                </div>
              ) : aiModal.error ? (
                <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-red-400 uppercase">Error al obtener diagnóstico</p>
                  <p className="text-[11px] text-slate-300">{aiModal.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                    {aiModal.analysis}
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                    <span>⚡ Generado con @google/genai & Gemini 3.8 Flash</span>
                    <button
                      onClick={() => setAiModal(prev => ({ ...prev, open: false }))}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] rounded-xl tracking-wider transition-all"
                    >
                      Cerrar Diagnóstico
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

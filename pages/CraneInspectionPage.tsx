import React, { useState, useContext } from 'react';
import { ActiveSession, CraneInspection } from '../types';
import { addCraneInspection } from '../services/db';
import { SessionContext } from '../contexts/SessionContext';
import { 
  Shield, 
  Disc, 
  Settings, 
  Lightbulb, 
  Wrench, 
  User, 
  Radio, 
  Droplets, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  LogOut
} from 'lucide-react';

interface CraneInspectionPageProps {
  activeSession: ActiveSession;
  onComplete: () => void;
}

interface InspectionItem {
  key: string;
  label: string;
}

interface ItemCategory {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: InspectionItem[];
}

export default function CraneInspectionPage({ activeSession, onComplete }: CraneInspectionPageProps) {
  const { logout } = useContext(SessionContext);
  const [scores, setScores] = useState<Record<string, number>>({});
  
  // Fugas State
  const [fugaDetectada, setFugaDetectada] = useState<'Sí' | 'No'>('No');
  const [tipoFuga, setTipoFuga] = useState<string>('');
  const [ubicacionFuga, setUbicacionFuga] = useState<string>('');
  const [otroDetalleFuga, setOtroDetalleFuga] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleQuickBypass = async () => {
    setError('');
    setSaving(true);
    try {
      const inspectionData: Omit<CraneInspection, 'id'> = {
        sessionId: activeSession.session.id!,
        craneUsageId: activeSession.craneUsage.id!,
        timestamp: new Date(),
        crane: activeSession.craneUsage.crane,
        operator: activeSession.session.operator,
        reingresoBypass: true,
        
        frenos: 4,
        frenoEstacionamiento: 4,
        alarmasBocina: 4,
        
        llantaDelanteraIzqExt: 4,
        llantaDelanteraIzqInt: 4,
        llantaDelanteraDerExt: 4,
        llantaDelanteraDerInt: 4,
        llantaTraseraIzquierda: 4,
        llantaTraseraDerecha: 4,
        
        fugaDetectada: 'No',
        
        boom: 4,
        spreader: 4,
        sideShift: 4,
        
        lucesTrabajo: 4,
        luzSemaforo: 4,
        direccionales: 4,
        lucesFreno: 4,
        lucesFrontales: 4,
        
        fajas: 4,
        tornamesa: 4,
        manguerasVisibles: 4,
        
        ac: 4,
        abanicos: 4,
        asiento: 4,
        parabrisas: 4,
        
        radio: 4
      };

      await addCraneInspection(inspectionData);
      onComplete();
    } catch (err) {
      console.error(err);
      setError('Error al guardar la inspección de reingreso. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const categories: ItemCategory[] = [
    {
      title: '🚨 Seguridad',
      icon: <Shield className="w-4 h-4 text-red-650" />,
      color: 'border-red-100 bg-red-50/10',
      items: [
        { key: 'frenos', label: 'Frenos' },
        { key: 'frenoEstacionamiento', label: 'Freno de Estacionamiento (Entrampe)' },
        { key: 'alarmasBocina', label: 'Alarmas / Bocina' }
      ]
    },
    {
      title: '🛞 Llantas (4 Delanteras, 2 Traseras)',
      icon: <Disc className="w-4 h-4 text-zinc-650" />,
      color: 'border-zinc-200 bg-zinc-50/10',
      items: [
        { key: 'llantaDelanteraIzqExt', label: 'Delantera Izquierda Ext.' },
        { key: 'llantaDelanteraIzqInt', label: 'Delantera Izquierda Int.' },
        { key: 'llantaDelanteraDerExt', label: 'Delantera Derecha Ext.' },
        { key: 'llantaDelanteraDerInt', label: 'Delantera Derecha Int.' },
        { key: 'llantaTraseraIzquierda', label: 'Trasera Izquierda' },
        { key: 'llantaTraseraDerecha', label: 'Trasera Derecha' }
      ]
    },
    {
      title: '⚙️ Operación / Hidráulico',
      icon: <Settings className="w-4 h-4 text-blue-650" />,
      color: 'border-blue-100 bg-blue-50/10',
      items: [
        { key: 'boom', label: 'Boom (Velocidad / Respuesta)' },
        { key: 'spreader', label: 'Spreader (Estabilidad)' },
        { key: 'sideShift', label: 'Side Shift' }
      ]
    },
    {
      title: '💡 Luces y Señales',
      icon: <Lightbulb className="w-4 h-4 text-amber-505" />,
      color: 'border-amber-100 bg-amber-50/10',
      items: [
        { key: 'lucesTrabajo', label: 'Luces de Trabajo' },
        { key: 'luzSemaforo', label: 'Luz Semáforo' },
        { key: 'direccionales', label: 'Direccionales' },
        { key: 'lucesFreno', label: 'Luces de Freno' },
        { key: 'lucesFrontales', label: 'Luces Frontales' }
      ]
    },
    {
      title: '🔧 Mecánico Básico',
      icon: <Wrench className="w-4 h-4 text-emerald-805" />,
      color: 'border-emerald-100 bg-emerald-50/10',
      items: [
        { key: 'fajas', label: 'Fajas (Ruido / Condición)' },
        { key: 'tornamesa', label: 'Tornamesa' },
        { key: 'manguerasVisibles', label: 'Mangueras Visibles' }
      ]
    },
    {
      title: '🪑 Cabina',
      icon: <User className="w-4 h-4 text-purple-655" />,
      color: 'border-purple-100 bg-purple-50/10',
      items: [
        { key: 'ac', label: 'A/C' },
        { key: 'abanicos', label: 'Abanicos' },
        { key: 'asiento', label: 'Asiento' },
        { key: 'parabrisas', label: 'Parabrisas' }
      ]
    },
    {
      title: '📡 Comunicación',
      icon: <Radio className="w-4 h-4 text-teal-655" />,
      color: 'border-teal-100 bg-teal-50/10',
      items: [
        { key: 'radio', label: 'Radio' }
      ]
    }
  ];

  const allItemKeys = categories.flatMap(cat => cat.items.map(i => i.key));

  const handleScoreSelect = (itemKey: string, score: number) => {
    setScores(prev => ({
      ...prev,
      [itemKey]: score
    }));
  };

  const handleSave = async () => {
    setError('');

    // 1. Validate that every state key is filled
    const missingItems = allItemKeys.filter(key => !scores[key]);
    if (missingItems.length > 0) {
      setError('⚠️ Por favor, califique todos los ítems de la lista.');
      return;
    }

    // 2. Validate Fugas if Yes is selected
    if (fugaDetectada === 'Sí') {
      if (!tipoFuga) {
        setError('⚠️ Seleccione el tipo de fuga.');
        return;
      }
      if (!ubicacionFuga) {
        setError('⚠️ Seleccione la ubicación de la fuga.');
        return;
      }
      if (ubicacionFuga === 'Otro' && !otroDetalleFuga.trim()) {
        setError('⚠️ Escriba los detalles de la ubicación de la fuga (Otro).');
        return;
      }
    }

    setSaving(true);
    try {
      const inspectionData: Omit<CraneInspection, 'id'> = {
        sessionId: activeSession.session.id!,
        craneUsageId: activeSession.craneUsage.id!,
        timestamp: new Date(),
        crane: activeSession.craneUsage.crane,
        operator: activeSession.session.operator,
        
        frenos: scores['frenos'],
        frenoEstacionamiento: scores['frenoEstacionamiento'],
        alarmasBocina: scores['alarmasBocina'],
        
        llantaDelanteraIzqExt: scores['llantaDelanteraIzqExt'],
        llantaDelanteraIzqInt: scores['llantaDelanteraIzqInt'],
        llantaDelanteraDerExt: scores['llantaDelanteraDerExt'],
        llantaDelanteraDerInt: scores['llantaDelanteraDerInt'],
        llantaTraseraIzquierda: scores['llantaTraseraIzquierda'],
        llantaTraseraDerecha: scores['llantaTraseraDerecha'],
        
        fugaDetectada,
        tipoFuga: fugaDetectada === 'Sí' ? tipoFuga : undefined,
        ubicacionFuga: fugaDetectada === 'Sí' ? ubicacionFuga : undefined,
        otroDetalleFuga: fugaDetectada === 'Sí' && ubicacionFuga === 'Otro' ? otroDetalleFuga : undefined,
        
        boom: scores['boom'],
        spreader: scores['spreader'],
        sideShift: scores['sideShift'],
        
        lucesTrabajo: scores['lucesTrabajo'],
        luzSemaforo: scores['luzSemaforo'],
        direccionales: scores['direccionales'],
        lucesFreno: scores['lucesFreno'],
        lucesFrontales: scores['lucesFrontales'],
        
        fajas: scores['fajas'],
        tornamesa: scores['tornamesa'],
        manguerasVisibles: scores['manguerasVisibles'],
        
        ac: scores['ac'],
        abanicos: scores['abanicos'],
        asiento: scores['asiento'],
        parabrisas: scores['parabrisas'],
        
        radio: scores['radio']
      };

      await addCraneInspection(inspectionData);
      onComplete();
    } catch (err) {
      console.error(err);
      setError('Error al guardar la inspección. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const getScoreColor = (score: number, isSelected: boolean) => {
    switch (score) {
      case 4: return isSelected ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold scale-110 shadow-sm' : 'bg-emerald-50/70 text-emerald-750 border-emerald-200 hover:bg-emerald-100';
      case 3: return isSelected ? 'bg-[#f39c12] text-white border-[#f39c12] font-extrabold scale-110 shadow-sm' : 'bg-yellow-50/70 text-yellow-805 border-yellow-200 hover:bg-yellow-100';
      case 2: return isSelected ? 'bg-orange-500 text-white border-orange-500 font-extrabold scale-110 shadow-sm' : 'bg-orange-50/70 text-orange-750 border-orange-200 hover:bg-orange-100';
      case 1: return isSelected ? 'bg-rose-600 text-white border-rose-600 font-extrabold scale-110 shadow-sm' : 'bg-rose-50/70 text-rose-750 border-rose-200 hover:bg-rose-100';
      default: return 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-2 md:p-6 text-zinc-800 pb-20 font-sans">
      <div className="max-w-2xl mx-auto space-y-4">
        
        {/* Upper utilities bar */}
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Procedimiento Obligatorio</span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir / Cerrar</span>
          </button>
        </div>
        
        {/* Compact Header optimized for smartphone screens */}
        <header className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#596e2e]/10 p-2.5 rounded-xl border border-[#596e2e]/20 text-[#596e2e] flex-shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-[#0a1d37] leading-none uppercase tracking-tight italic">INSPECCIÓN DE GRÚAS</h1>
              <p className="text-[10px] font-bold text-[#596e2e] mt-1 uppercase tracking-wider">CHECKLIST OBLIGATORIO DE INICIO</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 text-[10px] font-bold text-zinc-500">
            <div>
              <span className="block text-zinc-400 uppercase text-[9px] mb-0.5">OPERADOR:</span>
              <span className="font-extrabold text-zinc-700 uppercase line-clamp-1">{activeSession.session.operator}</span>
            </div>
            <div>
              <span className="block text-zinc-400 uppercase text-[9px] mb-0.5">MÁQUINA / GRÚA:</span>
              <span className="font-extrabold text-orange-600 uppercase">{activeSession.craneUsage.crane}</span>
            </div>
          </div>
        </header>

        {/* Quick Re-entry option */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-2.5">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div className="space-y-0.5">
              <h4 className="text-xs font-black uppercase text-amber-400 tracking-wide">¿Reingreso por cierre accidental?</h4>
              <p className="text-[10px] text-slate-300 font-bold leading-normal uppercase">
                Si cerró la sesión por error y la grúa <span className="text-orange-400">{activeSession.craneUsage.crane}</span> ya fue inspeccionada por usted hoy, puede empezar inmediatamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleQuickBypass}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {saving ? 'Cargando...' : '⏩ YA HICE LA INSPECCIÓN (INICIAR TURNO)'}
          </button>
        </section>

        {/* Dynamic & super tight Legend of options to look elegant on phone */}
        <section className="bg-white border border-zinc-200 rounded-xl p-3 shadow-xs">
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center mb-2">Escala de Evaluación</p>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-emerald-50 text-emerald-700 border border-emerald-150 p-1.5 rounded-lg">
              <span className="block text-[9px] font-black">4 = BIEN</span>
            </div>
            <div className="bg-yellow-50 text-yellow-700 border border-yellow-150 p-1.5 rounded-lg">
              <span className="block text-[9px] font-black">3 = D MENOR</span>
            </div>
            <div className="bg-orange-50 text-orange-750 border border-orange-150 p-1.5 rounded-lg">
              <span className="block text-[9px] font-black">2 = D MAYOR</span>
            </div>
            <div className="bg-rose-50 text-rose-700 border border-rose-150 p-1.5 rounded-lg">
              <span className="block text-[9px] font-black">1 = CRÍTICO</span>
            </div>
          </div>
        </section>

        {/* Categories Checklist Form */}
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category.title} className="bg-white border border-zinc-200 rounded-2xl p-3.5 md:p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                {category.icon}
                <h3 className="text-xs font-black text-zinc-800 uppercase tracking-tight">{category.title}</h3>
              </div>
              
              <div className="divide-y divide-zinc-100">
                {category.items.map((item) => (
                  <div key={item.key} className="py-2.5 flex items-center justify-between gap-2 text-left">
                    <span className="text-xs font-bold text-zinc-700 uppercase leading-snug line-clamp-2 max-w-[55%]">
                      {item.label}
                    </span>
                    
                    {/* Small Rating buttons (designed to solve 'hacer los números más pequeños') */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      {[4, 3, 2, 1].map((lvl) => {
                        const isSelected = scores[item.key] === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => handleScoreSelect(item.key, lvl)}
                            className={`w-8 h-8 rounded-full border text-xs font-extrabold transition-all cursor-pointer select-none active:scale-90 text-center flex items-center justify-center ${getScoreColor(lvl, isSelected)}`}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Clean & Compact Fugas Card */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
              <Droplets className="w-4 h-4 text-blue-600 animate-pulse" />
              <h3 className="text-xs font-black text-zinc-800 uppercase tracking-tight">🛢️ Fugas Detectadas</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-zinc-700 uppercase">¿Detecta fugas en la grúa?</span>
                <div className="flex gap-2">
                  {(['Sí', 'No'] as const).map((opt) => {
                    const isSelected = fugaDetectada === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setFugaDetectada(opt);
                          if (opt === 'No') {
                            setTipoFuga('');
                            setUbicacionFuga('');
                            setOtroDetalleFuga('');
                          }
                        }}
                        className={`w-16 py-1.5 text-xs font-black uppercase rounded-lg border transition-all active:scale-95 cursor-pointer h-9 flex items-center justify-center ${
                          isSelected 
                            ? opt === 'Sí'
                              ? 'bg-red-600 border-red-600 text-white shadow-sm'
                              : 'bg-zinc-800 border-zinc-800 text-white shadow-sm'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Fugas Fields with supreme styling */}
              {fugaDetectada === 'Sí' && (
                <div className="p-3 bg-red-50/30 border border-red-100 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-150">
                  <div className="grid grid-cols-1 gap-3">
                    
                    {/* Tipo de Fuga */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black text-red-700 uppercase tracking-wide">Tipo de Fuga</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Aceite', 'Agua'].map((tipo) => {
                          const isSelected = tipoFuga === tipo;
                          return (
                            <button
                              key={tipo}
                              type="button"
                              onClick={() => setTipoFuga(tipo)}
                              className={`py-1.5 text-xs font-black uppercase rounded-lg border transition-all h-9 flex items-center justify-center ${
                                isSelected
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-red-50/40'
                              }`}
                            >
                              {tipo}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ubicación */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black text-red-700 uppercase tracking-wide">Ubicación de Fuga</label>
                      <select
                        value={ubicacionFuga}
                        onChange={(e) => setUbicacionFuga(e.target.value)}
                        className="w-full p-2 bg-white border border-zinc-250 rounded-lg text-xs font-bold text-zinc-855 outline-none focus:ring-1 focus:ring-red-500 h-9"
                      >
                        <option value="">--Seleccionar Ubicación--</option>
                        {['Boom', 'Parte baja', 'Cabina', 'Llantas', 'Mangueras', 'Otro'].map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>

                  </div>

                  {/* Otro detalle text field if 'Otro' selected */}
                  {ubicacionFuga === 'Otro' && (
                    <div className="space-y-1 animate-in zoom-in-95 duration-100 pt-1">
                      <label className="block text-[9px] font-black text-red-700 uppercase tracking-wide">Especifique ubicación</label>
                      <input
                        type="text"
                        value={otroDetalleFuga}
                        onChange={(e) => setOtroDetalleFuga(e.target.value)}
                        placeholder="Escriba los detalles aquí..."
                        className="w-full p-2 bg-white border border-zinc-250 rounded-lg text-xs font-semibold text-zinc-800 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-red-500 h-9"
                      />
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-pulse">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <p className="text-[10px] font-black uppercase text-left leading-tight">{error}</p>
          </div>
        )}

        {/* Action Bottom Section */}
        <div className="pt-2 pb-10 text-center">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 active:scale-95 cursor-pointer h-12"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Guardando Pre-Inspección...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Iniciar Turno de Trabajo</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

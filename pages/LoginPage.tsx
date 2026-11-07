
import React, { useState, useContext, useEffect, useCallback } from 'react';
import { SessionContext } from '../contexts/SessionContext';
import { startNewSession, getAppConfig, checkCraneAvailability, getAllActiveCranes, forceReleaseCrane, getActiveSessionFromDb, endCurrentSessionWithMeters, subscribeToAppConfig, getLastHourMeterForCrane } from '../services/db';
import { ADMIN_USER, getCraneWarning } from '../constants';
import { AppConfigKey } from '../types';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

const getSortedOperators = (operatorsList: string[]) => {
  const filtered = (operatorsList || []).filter(o => o !== ADMIN_USER);
  const sorted = [...filtered].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const pruebaOps = sorted.filter(o => o.toLowerCase().includes('prueba'));
  const otherOps = sorted.filter(o => !o.toLowerCase().includes('prueba'));
  return [...pruebaOps, ...otherOps];
};

interface LoginPageProps {
  setView: (view: 'OPERATOR' | 'ADMIN' | 'MECHANICS') => void;
}

export default function LoginPage({ setView }: LoginPageProps) {
  const { setActiveSession } = useContext(SessionContext);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);
  
  const [config, setConfig] = useState<Record<AppConfigKey, string[]>>({
      OPERATORS: [], SHIFTS: [], WORK_TYPES: [], CLIENTS: [], CRANES: [], YARDS: [],
      MOVEMENT_REASONS: [], CRANE_CHANGE_REASONS: []
  });

  const [activeCranes, setActiveCranes] = useState<Record<string, { operator: string, yard: string }>>({});
  const [operator, setOperator] = useState('');
  const [shift, setShift] = useState('');
  const [workType, setWorkType] = useState('');
  const [client, setClient] = useState('');
  const [crane, setCrane] = useState('');
  const [yard, setYard] = useState('');
  const [startHourMeter, setStartHourMeter] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [warningData, setWarningData] = useState<{ targetName: string; refVal: number; isMassiveJump?: boolean } | null>(null);
  const [lastMeter, setLastMeter] = useState<number | undefined>(undefined);
  const [isReleasing, setIsReleasing] = useState(false);
  const [activeSessionInDb, setActiveSessionInDb] = useState<any>(null);
  const [showEndSessionMeterModal, setShowEndSessionMeterModal] = useState(false);
  const [endSessionMeterValue, setEndSessionMeterValue] = useState('');
  const [endSessionError, setEndSessionError] = useState('');

  const loadActivesAndSession = useCallback(async () => {
    try {
      const actives = await getAllActiveCranes();
      setActiveCranes(actives);

      const recovered = await getActiveSessionFromDb();
      setActiveSessionInDb(recovered);
    } catch (err) {
      console.error("Error al cargar grúas activas/sesión:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAppConfig((appConfig) => {
      setConfig(appConfig);
      
      // Preseleccionar valores iniciales si es necesario para evitar campos vacíos
      setOperator(prev => {
        if (prev) return prev;
        const ops = getSortedOperators(appConfig.OPERATORS);
        return ops.length > 0 ? ops[0] : '';
      });
      setShift(prev => {
        if (prev) return prev;
        return appConfig.SHIFTS?.length > 0 ? appConfig.SHIFTS[0] : '';
      });
      setWorkType(prev => {
        if (prev) return prev;
        return appConfig.WORK_TYPES?.length > 0 ? appConfig.WORK_TYPES[0] : '';
      });
      setClient(prev => {
        if (prev) return prev;
        return appConfig.CLIENTS?.length > 0 ? appConfig.CLIENTS[0] : '';
      });
      setYard(prev => {
        if (prev) return prev;
        return appConfig.YARDS?.length > 0 ? appConfig.YARDS[0] : '';
      });
      setCrane(prev => {
        if (prev) return prev;
        return appConfig.CRANES?.length > 0 ? appConfig.CRANES[0] : '';
      });
    });

    loadActivesAndSession();

    return () => unsubscribe();
  }, [loadActivesAndSession]);

  useEffect(() => {
    if (crane) {
      if (crane.toLowerCase().includes('sisu')) {
        setStartHourMeter('1');
      } else if (startHourMeter === '1') {
        setStartHourMeter('');
      }
      getLastHourMeterForCrane(crane).then(val => {
        setLastMeter(val);
      });
    } else {
      setLastMeter(undefined);
    }
  }, [crane]);

  const handleCraneChange = async (val: string) => {
      setCrane(val);
      const busyInfo = activeCranes[val];
      if (busyInfo) {
          setError(`⚠️ ALARMA: La grúa ${val} está ocupada por "${busyInfo.operator}".`);
      } else {
          setError('');
      }
  };

  const handleReleaseCrane = async () => {
    if (!crane) return;
    setIsReleasing(true);
    try {
      await forceReleaseCrane(crane);
      setError('');
      const actives = await getAllActiveCranes();
      setActiveCranes(actives);
      alert(`✅ Grúa ${crane} liberada exitosamente. Ahora puedes usarla.`);
    } catch (err) {
      console.error(err);
      setError('Error al intentar liberar la grúa.');
    } finally {
      setIsReleasing(false);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operator || !shift || !workType || !crane || !yard || !startHourMeter) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    const busyInfo = await checkCraneAvailability(crane);
    if (busyInfo) {
        setError(`🚨 ERROR: La ${crane} está siendo usada por "${busyInfo.operator}". Usa el botón "Liberar Grúa" si deseas forzar su disponibilidad.`);
        return;
    }

    const normalizedValue = startHourMeter.replace(',', '.');
    const currentMeterVal = parseFloat(normalizedValue);

    if (isNaN(currentMeterVal)) {
        setError('Horómetro inválido. Use formato 0000,00');
        return;
    }

    if (lastMeter !== undefined) {
        if (currentMeterVal > lastMeter + 50 || currentMeterVal < lastMeter) {
            setWarningData({
                targetName: crane,
                refVal: lastMeter,
                isMassiveJump: true
            });
            return;
        }
    }

    const warning = getCraneWarning(crane, currentMeterVal);
    if (warning) {
      setWarningData(warning);
      return;
    }

    await executeStartSession(currentMeterVal);
  };

  const executeStartSession = async (currentMeterVal: number) => {
    try {
      setError('');
      const { session, craneUsage } = await startNewSession(
        operator,
        shift,
        workType,
        crane,
        yard,
        currentMeterVal,
        client
      );
      setActiveSession({ session, craneUsage });
      setView('OPERATOR');
    } catch (err) {
      setError('Error al iniciar la sesión.');
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin') {
      setView('ADMIN');
    } else {
      setError('Contraseña incorrecta.');
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user.email === 'rfonseca047@gmail.com') {
        setView('ADMIN');
      } else {
        setError('Acceso denegado: Solo administradores autorizados.');
      }
    } catch (err) {
      console.error(err);
      setError('Error al iniciar sesión con Google.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5a6e35]"></div>
      </div>
    );
  }

  if (warningData) {
    return (
      <div className="flex flex-col items-center justify-start min-h-screen bg-zinc-50 p-4 pt-10 text-zinc-800">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-lg border border-zinc-200 mb-8 max-h-[90vh] overflow-y-auto border-t-8 border-t-red-600 animate-in zoom-in duration-200">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-red-50 border border-red-200 text-red-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-red-600 tracking-tight uppercase">⚠️ ¡ALERTA DE SEGURIDAD!</h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">CONFIRMACIÓN DE GRÚA Y HORÓMETRO</p>
          </div>

          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-extrabold text-zinc-500 uppercase">Grúa Seleccionada:</span>
              <span className="font-black text-zinc-800 uppercase text-sm">{crane}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-extrabold text-zinc-500 uppercase">Horómetro Ingresado:</span>
              <span className="font-black text-red-600 font-mono text-lg">{startHourMeter}</span>
            </div>
            
            <div className="border-t border-zinc-200 pt-3 space-y-1">
              <p className="text-xs text-red-700 font-bold uppercase text-center leading-relaxed">
                {warningData.isMassiveJump ? (
                  `⚠️ ¡ERROR DE DIGITACIÓN DETECTADO! El horómetro ingresado (${startHourMeter}) difiere significativamente del último registrado para esta grúa (${warningData.refVal?.toString().replace('.', ',') || 'N/A'}). Por favor, revise si olvidó colocar el punto decimal (ej: va por 4628,5 en lugar de 46285).`
                ) : warningData.targetName === crane ? (
                  `⚠️ El valor ingresado difiere excesivamente del rango esperado para la grúa ${crane} (Ref: ${warningData.refVal.toString().replace('.', ',')}).`
                ) : (
                  `⚠️ ¡ATENCIÓN! Este horómetro (${startHourMeter}) parece corresponder a la grúa ${warningData.targetName} (Ref: ${warningData.refVal.toString().replace('.', ',')}) y no a la grúa seleccionada ${crane}.`
                )}
              </p>
            </div>
          </div>

          <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-center">
            <p className="text-[10px] text-[#e67e22] font-bold uppercase leading-snug">
              ¡Por favor verifique físicamente que se encuentra a bordo del equipo correcto antes de continuar!
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setWarningData(null)}
              className="w-full py-3.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl hover:bg-zinc-200 font-black uppercase text-xs tracking-wider transition-all"
            >
              ⬅️ Volver y Corregir
            </button>
            <button
              type="button"
              onClick={async () => {
                const normalizedValue = startHourMeter.replace(',', '.');
                const currentMeterVal = parseFloat(normalizedValue);
                setWarningData(null);
                await executeStartSession(currentMeterVal);
              }}
              className="w-full py-4 bg-[#5a6e35] border border-[#718b45] text-white rounded-xl hover:bg-[#6b8241] font-black uppercase text-xs tracking-wider shadow-lg active:scale-95 transition-all"
            >
              ✅ Confirmar (Grúa Correcta)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-zinc-50 p-4 pt-10 text-zinc-800">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-xl border border-zinc-200 mb-8">
        <div className="text-center">
            <h1 className="text-3xl font-black text-[#0a1d37] leading-none uppercase tracking-tighter italic">
              SISTEMA GRÚAS
            </h1>
            <div className="w-16 h-1 bg-[#5a6e35] mx-auto mt-4 rounded-full"></div>
        </div>

        {activeSessionInDb && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3 text-center animate-in fade-in duration-200 shadow-sm">
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase text-amber-600 tracking-wider">⚠️ Turno Abierto Detectado</span>
              <p className="text-xs font-bold text-zinc-700 leading-snug">
                El operador <span className="font-extrabold text-[#0a1d37] uppercase">{activeSessionInDb.session.operator}</span> tiene un turno activo en la grúa <span className="font-extrabold text-[#0a1d37] uppercase">{activeSessionInDb.craneUsage.crane}</span>.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveSession(activeSessionInDb);
                  setView('OPERATOR');
                }}
                className="flex-1 py-2 bg-[#5a6e35] hover:bg-[#6c8540] text-white font-black uppercase text-[10px] tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              >
                <span>🔄 REANUDAR</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEndSessionMeterValue('');
                  setEndSessionError('');
                  setShowEndSessionMeterModal(true);
                }}
                className="flex-1 py-2 bg-red-650 hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              >
                <span>🚪 CERRAR TURNO</span>
              </button>
            </div>
          </div>
        )}

        {user && !user.isAnonymous && (
          <div className="bg-slate-100 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-xs font-bold text-zinc-700 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 overflow-hidden mr-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="truncate text-[10px] uppercase tracking-wider text-zinc-650 font-extrabold leading-none">SESIÓN: {user.email}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm("¿Seguro que desea cerrar sesión y salir de la aplicación?")) {
                  await signOut(auth);
                }
              }}
              className="px-3 py-1.5 bg-red-650 hover:bg-red-700 text-white font-black uppercase text-[9px] tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer shrink-0"
            >
              🚪 SALIR
            </button>
          </div>
        )}
        
        {!showAdminLogin ? (
          <form className="space-y-4" onSubmit={handleStartSession}>
            <SelectControl label="Operador" value={operator} onChange={setOperator} options={getSortedOperators(config.OPERATORS)} />
            <SelectControl label="Turno" value={shift} onChange={setShift} options={config.SHIFTS} />
            <SelectControl label="Jornada" value={workType} onChange={setWorkType} options={config.WORK_TYPES} />
            {workType === 'Operación de Barco' && (
              <SelectControl label="Cliente" value={client} onChange={setClient} options={config.CLIENTS} />
            )}
            
            <div className="relative">
                <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1 tracking-widest">Grúa</label>
                <select
                    value={crane}
                    onChange={(e) => handleCraneChange(e.target.value)}
                    className={`w-full px-3 py-2.5 text-sm font-bold bg-white border rounded-xl focus:ring-1 focus:ring-[#5a6e35] outline-none transition-all appearance-none ${activeCranes[crane] ? 'border-red-300 text-red-500' : 'border-zinc-200 text-zinc-800'}`}
                >
                    {config.CRANES.map(opt => (
                        <option key={opt} value={opt} className="bg-white">
                            {opt} {activeCranes[opt] ? '🔴 (OCUPADA)' : ''}
                        </option>
                    ))}
                </select>
            </div>

            <SelectControl label="Predio" value={yard} onChange={setYard} options={config.YARDS} />
            
            <InputControl
                label="Horómetro Inicial"
                type="text"
                value={startHourMeter}
                onChange={(val) => setStartHourMeter(val.replace('.', ',').replace(/[^0-9,]/g, ''))}
                placeholder="0000,00"
                required
            />

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                    <p className="text-[10px] text-red-600 font-extrabold text-center uppercase leading-snug">{error}</p>
                    {activeCranes[crane] && (
                      <button
                        type="button"
                        onClick={handleReleaseCrane}
                        disabled={isReleasing}
                        className="w-full mt-2 py-2 text-center text-xs font-black uppercase rounded-lg bg-orange-50 hover:bg-orange-100 text-[#e67e22] border border-orange-200 transition-colors"
                      >
                        {isReleasing ? 'Liberando...' : `🔓 LIBERAR GRÚA Y CONTINGENCIA`}
                      </button>
                    )}
                </div>
            )}
            
            <button
              type="submit"
              disabled={!!activeCranes[crane]}
              className={`w-full px-4 py-4 text-white rounded-xl transition-all font-black uppercase shadow-lg active:scale-95 ${!!activeCranes[crane] ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-350' : 'bg-[#5a6e35] hover:bg-[#6c8540] border border-[#718b45]'}`}
            >
              Iniciar Jornada
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleAdminLogin}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Panel Administrativo</h3>
                <button type="button" onClick={() => setShowAdminLogin(false)} className="text-[10px] font-black text-[#e67e22] uppercase">Volver</button>
            </div>
            <InputControl
              label="Contraseña"
              type="password"
              value={adminPassword}
              onChange={setAdminPassword}
              placeholder="••••••••"
              required
            />
            {error && <p className="text-xs text-red-600 font-black text-center uppercase">{error}</p>}
            <button
              type="submit"
              className="w-full px-4 py-4 text-white bg-[#5a6e35] hover:bg-[#6c8540] border border-[#718b45] rounded-xl transition-all font-black uppercase shadow-lg"
            >
              Acceder al Sistema
            </button>

            <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-zinc-500 font-bold">O TAMBIÉN</span></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full px-4 py-4 text-zinc-700 bg-white border-2 border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all font-black uppercase shadow-sm flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Login con Google
            </button>
          </form>
        )}
      </div>

      {!showAdminLogin && (
          <div className="flex flex-col gap-3 w-full max-w-md">
            <button 
              onClick={() => setView('MECHANICS')}
              className="w-full py-4 text-xs font-black text-slate-950 bg-amber-400 border border-amber-500 uppercase tracking-wider rounded-xl hover:bg-amber-500 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              🔧 TALLER / MECÁNICOS (FALLAS)
            </button>

            <button 
              onClick={() => setShowAdminLogin(true)}
              className="w-full py-3.5 text-xs font-black text-zinc-700 bg-white border border-zinc-200 uppercase tracking-wider rounded-xl hover:bg-[#f4f4f5] shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              ADMIN
            </button>
          </div>
      )}

      {showEndSessionMeterModal && activeSessionInDb && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-6 border border-zinc-100 text-zinc-800 animate-in zoom-in-95 duration-150">
            <div className="text-center">
              <span className="text-3xl">🎚️</span>
              <h3 className="text-lg font-black text-[#0a1d37] uppercase tracking-tight mt-2">Cerrar Turno de Grúa</h3>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mt-1">
                EQUIPO: {activeSessionInDb.craneUsage.crane}
              </p>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-center space-y-2">
              <p className="text-[11px] font-bold text-amber-805 leading-relaxed">
                Antes de cerrar el turno de <span className="font-extrabold uppercase">{activeSessionInDb.session.operator}</span>, es obligatorio ingresar el horómetro del equipo.
              </p>
              <div className="flex justify-between items-center text-[10px] font-black text-amber-700 uppercase pt-2 border-t border-amber-200/60 font-mono">
                <span>⚙️ Horómetro Inicial:</span>
                <span>{activeSessionInDb.craneUsage.startHourMeter.toString().replace('.', ',')}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider text-center">
                Horómetro Final
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={endSessionMeterValue}
                onChange={(e) => {
                  setEndSessionError('');
                  setEndSessionMeterValue(e.target.value.replace('.', ',').replace(/[^0-9,]/g, ''));
                }}
                placeholder="0000,00"
                className="w-full p-4 border border-zinc-200 rounded-2xl font-black text-2xl text-center bg-zinc-50 text-zinc-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#5a6e35] transition-all"
              />
              {endSessionError && (
                <p className="text-xs font-extrabold text-[#991b1b] text-center uppercase animate-pulse">{endSessionError}</p>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowEndSessionMeterModal(false);
                  setEndSessionMeterValue('');
                  setEndSessionError('');
                }}
                className="flex-1 py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold uppercase text-[10px] tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const val = parseFloat(endSessionMeterValue.replace(',', '.'));
                  if (isNaN(val)) {
                    setEndSessionError('Escriba el horómetro final.');
                    return;
                  }
                  if (val < activeSessionInDb.craneUsage.startHourMeter) {
                    if (!window.confirm(`El horómetro final (${val}) es menor al inicial (${activeSessionInDb.craneUsage.startHourMeter}). ¿Seguro que desea guardar?`)) {
                      return;
                    }
                  }
                  try {
                    await endCurrentSessionWithMeters(activeSessionInDb.session.id!, {
                      [activeSessionInDb.craneUsage.id!]: val
                    });
                    setShowEndSessionMeterModal(false);
                    setActiveSessionInDb(null);
                    setActiveSession(null);
                    await loadActivesAndSession();
                  } catch (err: any) {
                    setEndSessionError(err.message || 'Error al guardar.');
                  }
                }}
                className="flex-1 py-3 px-4 bg-red-650 hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SelectProps { label: string; value: string; onChange: (value: string) => void; options?: string[]; }
const SelectControl: React.FC<SelectProps> = ({ label, value, onChange, options = [] }) => (
    <div>
        <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1 tracking-widest">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2.5 text-sm font-bold bg-white border border-zinc-200 rounded-xl focus:ring-1 focus:ring-[#5a6e35] outline-none transition-all appearance-none text-zinc-800"
        >
            {options.map(opt => <option key={opt} value={opt} className="bg-white text-zinc-800">{opt}</option>)}
        </select>
    </div>
);

interface InputProps { label: string; type: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; }
const InputControl: React.FC<InputProps> = ({ label, type, value, onChange, placeholder, required }) => (
    <div>
        <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1 tracking-widest">{label}</label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            className="w-full px-4 py-3 text-lg font-black text-center text-zinc-800 bg-white border border-zinc-200 rounded-xl focus:ring-1 focus:ring-[#5a6e35] outline-none transition-all"
        />
    </div>
);

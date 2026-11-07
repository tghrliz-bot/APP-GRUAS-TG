
import React, { useState, useContext, useEffect, useCallback } from 'react';
import { SessionContext } from '../contexts/SessionContext';
import { Movement, AppConfigKey, WorkshopRecord, CraneUsage } from '../types';
import { addMovement, getRecentMovements, changeCrane, changeYard, endCurrentSessionWithMeters, countSessionMovements, getAppConfig, getLastHourMeterForCrane, addWorkshopRecord, getLatestUsageInSession, getPendingSyncCount, getPendingHourMetersForSession, checkCraneAvailability, getAllActiveCranes, getCraneFailures, addManualCraneFailure, subscribeToAppConfig, updateCraneFailure } from '../services/db';
import { getCraneWarning } from '../constants';
import { 
  ArrowDownToLine, 
  ArrowUpToLine, 
  Truck, 
  RotateCcw, 
  Wrench, 
  HelpCircle, 
  Package, 
  LayoutGrid, 
  Split, 
  Layers, 
  Construction, 
  ArrowLeft, 
  MapPin, 
  AlertTriangle,
  LogOut,
  Thermometer
} from 'lucide-react';

interface OperatorDashboardProps {
    setView: (view: 'LOGIN' | 'ADMIN') => void;
}

const getReasonStyle = (reason: string): { emoji: string; color: string } => {
    switch (reason) {
        case "Recepción": return { emoji: "📥", color: "bg-green-500 hover:bg-green-600" };
        case "Despacho": return { emoji: "📤", color: "bg-blue-500 hover:bg-blue-600" };
        case "Re-estibas": return { emoji: "🔄", color: "bg-yellow-500 hover:bg-yellow-600" };
        case "Cambios de chasis": return { emoji: "🚚", color: "bg-purple-500 hover:bg-purple-600" };
        case "Revisión en Racks": return { emoji: "✅", color: "bg-teal-500 hover:bg-teal-600" };
        case "Taller": return { emoji: "🛠️", color: "bg-orange-500 hover:bg-orange-600" };
        case "Otro": return { emoji: "❓", color: "bg-gray-500 hover:bg-gray-600" };
        default: return { emoji: "🔘", color: "bg-gray-500 hover:bg-gray-600" };
    }
};

const getMovementStyle = (reason: string) => {
    switch (reason) {
        case 'Recepción':
            return { bg: 'bg-green-50', text: 'text-green-700 font-bold', border: 'border-green-200', label: 'Recepción' };
        case 'Despacho':
            return { bg: 'bg-blue-50', text: 'text-blue-700 font-bold', border: 'border-blue-200', label: 'Despacho' };
        case 'Cambios de chasis':
            return { bg: 'bg-purple-50', text: 'text-purple-700 font-bold', border: 'border-purple-200', label: 'Chasis' };
        case 'Colocación taller':
            return { bg: 'bg-orange-50', text: 'text-orange-700 font-bold', border: 'border-orange-200', label: 'Taller' };
        case 'Rest. Despacho':
            return { bg: 'bg-yellow-50', text: 'text-yellow-750 font-bold', border: 'border-yellow-200', label: 'R. Despacho' };
        case 'Rest. Acomodo Patio':
            return { bg: 'bg-amber-50', text: 'text-amber-700 font-bold', border: 'border-amber-200', label: 'R. Patio' };
        case 'Rest. Segregación':
            return { bg: 'bg-green-50', text: 'text-green-700 font-bold', border: 'border-green-200', label: 'R. Segreg' };
        case 'Rest. Rev. Rack':
            return { bg: 'bg-teal-50', text: 'text-teal-700 font-bold', border: 'border-teal-200', label: 'R. Rack' };
        case 'Rest. Taller Box':
            return { bg: 'bg-red-50', text: 'text-red-700 font-bold', border: 'border-red-200', label: 'R. Taller' };
        case 'Rep. Reefer':
            return { bg: 'bg-cyan-50', text: 'text-cyan-700 font-bold', border: 'border-cyan-200', label: 'Rep. Reefer' };
        default:
            return { bg: 'bg-zinc-50', text: 'text-zinc-650 font-bold', border: 'border-zinc-200', label: reason || 'Otro' };
    }
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <h3 className="text-sm font-black text-zinc-800 uppercase tracking-wider">{title}</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-zinc-650 p-1 rounded-full hover:bg-zinc-100 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto bg-white text-zinc-800">
                {children}
            </div>
        </div>
    </div>
);

export default function OperatorDashboard({ setView }: OperatorDashboardProps) {
    const { activeSession, setActiveSession, logout } = useContext(SessionContext);
    const [config, setConfig] = useState<Record<AppConfigKey, string[]>>({
        OPERATORS: [], SHIFTS: [], WORK_TYPES: [], CLIENTS: [], CRANES: [], YARDS: [],
        MOVEMENT_REASONS: [], CRANE_CHANGE_REASONS: []
    });
    const [client, setClient] = useState('');
    const [containerNumber, setContainerNumber] = useState(() => localStorage.getItem('staktrak_draft_container') || '');
    const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
    const [totalMovements, setTotalMovements] = useState(0);
    const [pendingSync, setPendingSync] = useState(0);
    const [isCraneModalOpen, setCraneModalOpen] = useState(false);
    const [isYardModalOpen, setYardModalOpen] = useState(false);
    const [isWorkshopModalOpen, setWorkshopModalOpen] = useState(false);
    const [isEndSessionModalOpen, setEndSessionModalOpen] = useState(false);
    const [isRackMultiplierModalOpen, setRackMultiplierModalOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
    const [showOnlyCurrentCrane, setShowOnlyCurrentCrane] = useState(false);
    const [showReestibaMenu, setShowReestibaMenu] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeToAppConfig((newConfig) => {
            setConfig(newConfig);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => { localStorage.setItem('staktrak_draft_container', containerNumber); }, [containerNumber]);

    const updateSyncStatus = useCallback(async () => setPendingSync(await getPendingSyncCount()), []);

    useEffect(() => {
        const interval = setInterval(updateSyncStatus, 5000);
        updateSyncStatus();
        return () => clearInterval(interval);
    }, [updateSyncStatus]);

    const fetchMovements = useCallback(async () => {
        if (activeSession?.session.id) {
            const craneFilter = showOnlyCurrentCrane ? activeSession.craneUsage.id : undefined;
            const movements = await getRecentMovements(activeSession.session.id, 5, craneFilter);
            setRecentMovements(movements);
            setTotalMovements(await countSessionMovements(activeSession.session.id));
        }
    }, [activeSession, showOnlyCurrentCrane]);

    useEffect(() => {
        if (activeSession) {
            if (config.CLIENTS.length > 0) setClient(activeSession.session.client || config.CLIENTS[0]);
            fetchMovements();
        } else { setView('LOGIN'); }
    }, [activeSession, fetchMovements, setView, config.CLIENTS]);

    const handleLogMovement = async (reason: string) => {
        if (!activeSession) return;
        if (!/^\d{7}$/.test(containerNumber)) {
            setStatusMessage({ type: 'error', text: 'El número debe tener 7 dígitos.' });
            setTimeout(() => setStatusMessage({ type: '', text: '' }), 3000);
            return;
        }
        if (reason === "Revisión en Racks") { setRackMultiplierModalOpen(true); return; }
        if (reason === "Rest. Rev. Rack") {
            await processMovementExecution(reason, 2);
            return;
        }
        await processMovementExecution(reason, 1);
    };

    const handleReestibaClassification = async (reason: string) => {
        if (!/^\d{7}$/.test(containerNumber)) {
            await handleLogMovement(reason);
            return;
        }
        setShowReestibaMenu(false);
        await handleLogMovement(reason);
    };

    const processMovementExecution = async (reason: string, count: number) => {
        if (!activeSession) return;
        try {
            const getBase = () => ({
                sessionId: activeSession.session.id!,
                craneUsageId: activeSession.craneUsage.id!,
                timestamp: new Date(),
                client,
                containerNumber,
                reason,
                yard: activeSession.craneUsage.yard,
                crane: activeSession.craneUsage.crane,
                operator: activeSession.session.operator,
            });
            for (let i = 0; i < count; i++) await addMovement(getBase());
            setStatusMessage({ type: 'success', text: `Registrado: ${reason}` });
            setContainerNumber('');
            localStorage.removeItem('staktrak_draft_container');
            fetchMovements();
            updateSyncStatus();
            setTimeout(() => setStatusMessage({ type: '', text: '' }), 3000);
        } catch (error) { console.error(error); }
    };
    
    if (!activeSession) return null;

    return (
        <div className="container mx-auto p-4 space-y-4 pb-20 max-w-md bg-zinc-50 min-h-screen text-zinc-800">
             <header className="flex justify-between items-center bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-zinc-50 rounded-lg border border-zinc-200">
                        <Wrench className="w-5 h-5 text-[#5a6e35]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-zinc-850 leading-none uppercase italic tracking-tight">SISTEMA GRÚAS</h1>
                        <p className={`text-[9px] font-black uppercase ${pendingSync > 0 ? 'text-[#e67e22]' : 'text-[#5a6e35]'}`}>{pendingSync > 0 ? `Sincronizando ${pendingSync}...` : 'Nube OK'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setEndSessionModalOpen(true)} 
                        className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-lg text-xs font-black uppercase shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
             </header>

             <div className="grid grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                <div className="text-center border-r border-zinc-100">
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Operador</p>
                    <p className="text-[10px] font-black text-zinc-700 uppercase truncate px-1">{activeSession.session.operator.split(' ')[0]}</p>
                </div>
                <div className="text-center border-r border-zinc-100">
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Grúa</p>
                    <p className="text-[10px] font-black text-[#e67e22] uppercase truncate px-1">{activeSession.craneUsage.crane}</p>
                </div>
                <div className="text-center border-r border-zinc-100">
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Predio</p>
                    <p className="text-[10px] font-black text-zinc-700 uppercase truncate px-1">{activeSession.craneUsage.yard}</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Movs</p>
                    <p className="text-sm font-black text-[#5a6e35] leading-none">{totalMovements}</p>
                </div>
             </div>
            
            <div className="bg-white p-5 rounded-xl shadow-sm border border-zinc-200 border-t-4 border-[#5a6e35]">
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-[10px] font-black text-zinc-550 uppercase mb-1">Cliente</label>
                        <select 
                            value={client} 
                            onChange={(e) => setClient(e.target.value)} 
                            disabled={activeSession.session.workType === 'Operación de Barco'} 
                            className="w-full p-2.5 border border-zinc-200 rounded-lg bg-zinc-50 text-zinc-805 text-sm font-bold focus:ring-[#5a6e35] outline-none"
                        >
                            {config.CLIENTS.map(c => <option key={c} value={c} className="bg-white text-zinc-800">{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-zinc-550 uppercase mb-1">Contenedor</label>
                        <input 
                            type="text" 
                            inputMode="numeric" 
                            pattern="[0-9]*"
                            value={containerNumber} 
                            onChange={(e) => setContainerNumber(e.target.value.replace(/\D/g, '').slice(0, 7))} 
                            placeholder="0000000" 
                            className="w-full p-2.5 border border-zinc-200 rounded-lg bg-white font-mono text-lg font-black text-center text-[#5a6e35] placeholder-zinc-300 focus:ring-1 focus:ring-[#5a6e35] outline-none transition-all"
                        />
                    </div>
                </div>
                
                {!showReestibaMenu ? (
                    <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                        <button 
                            type="button"
                            onClick={() => handleLogMovement("Recepción")} 
                            className="p-3 rounded-xl text-green-705 bg-green-50 hover:bg-green-100 border border-green-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <ArrowDownToLine className="w-5 h-5 mb-1 text-green-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Recepción</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleLogMovement("Despacho")} 
                            className="p-3 rounded-xl text-blue-705 bg-blue-55 hover:bg-blue-100 border border-blue-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <ArrowUpToLine className="w-5 h-5 mb-1 text-blue-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Despacho</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleLogMovement("Cambios de chasis")} 
                            className="p-3 rounded-xl text-purple-705 bg-purple-50 hover:bg-purple-100 border border-purple-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Truck className="w-5 h-5 mb-1 text-purple-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Cambio Chasis</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setShowReestibaMenu(true)} 
                            className="p-3 rounded-xl text-amber-705 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <RotateCcw className="w-5 h-5 mb-1 text-amber-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Re-estibas ➔</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleLogMovement("Colocación taller")} 
                            className="p-3 rounded-xl text-orange-705 bg-orange-50 hover:bg-orange-100 border border-orange-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Wrench className="w-5 h-5 mb-1 text-orange-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Coloc. Taller</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleLogMovement("Otro")} 
                            className="p-3 rounded-xl text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <HelpCircle className="w-5 h-5 mb-1 text-zinc-500" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Otro</span>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-right-5 duration-200">
                        <div className="col-span-2 text-center py-2 bg-amber-50 text-amber-805 font-black rounded-lg text-[10px] uppercase tracking-wider border border-amber-200">
                            🚧 Seleccione Tipo de Re-estiba
                        </div>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rest. Despacho")} 
                            className="p-3 rounded-xl text-sky-705 bg-sky-50 hover:bg-sky-100 border border-sky-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Package className="w-5 h-5 mb-1 text-sky-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">R. Despacho</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rest. Acomodo Patio")} 
                            className="p-3 rounded-xl text-[#e67e22] bg-amber-50 hover:bg-amber-100 border border-amber-250 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <LayoutGrid className="w-5 h-5 mb-1 text-[#e67e22]" />
                            <span className="text-[10px] font-black uppercase tracking-tight">R. Patio</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rest. Segregación")} 
                            className="p-3 rounded-xl text-green-705 bg-green-50 hover:bg-green-100 border border-green-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Split className="w-5 h-5 mb-1 text-green-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">R. Segreg</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rest. Rev. Rack")} 
                            className="p-3 rounded-xl text-teal-705 bg-teal-50 hover:bg-teal-100 border border-teal-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Layers className="w-5 h-5 mb-1 text-teal-600" />
                            <span className="text-[9px] font-black uppercase tracking-tight">R. Rack (x2)</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rest. Taller Box")} 
                            className="p-3 rounded-xl text-red-705 bg-red-50 hover:bg-red-100 border border-red-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Construction className="w-5 h-5 mb-1 text-red-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">R. Taller</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleReestibaClassification("Rep. Reefer")} 
                            className="p-3 rounded-xl text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <Thermometer className="w-5 h-5 mb-1 text-cyan-600" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Rep. Reefer</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setShowReestibaMenu(false)} 
                            className="p-3 rounded-xl text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-sm"
                        >
                            <ArrowLeft className="w-5 h-5 mb-1 text-zinc-500" />
                            <span className="text-[10px] font-black uppercase tracking-tight">Atrás</span>
                        </button>
                    </div>
                )}
                {statusMessage.text && <div className={`mt-3 p-2 rounded text-center font-black text-xs border ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{statusMessage.text}</div>}
            </div>

            <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setCraneModalOpen(true)} className="flex flex-col items-center p-3 bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all text-zinc-700">
                    <RotateCcw className="w-5 h-5 mb-1 text-[#e67e22]" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400 text-center leading-none">Cambiar Grúa</span>
                </button>
                <button onClick={() => setYardModalOpen(true)} className="flex flex-col items-center p-3 bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 active:scale-95 transition-all text-zinc-700">
                    <MapPin className="w-5 h-5 mb-1 text-[#e67e22]" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400 text-center leading-none">Cambiar Predio</span>
                </button>
                <button onClick={() => setWorkshopModalOpen(true)} className="flex flex-col items-center p-3 bg-red-50 border border-red-200 rounded-xl shadow-sm hover:bg-red-100 active:scale-95 transition-all text-red-600">
                    <AlertTriangle className="w-5 h-5 mb-1 text-red-505" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-center text-red-750 leading-none">Reportar Falla</span>
                </button>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="p-3 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
                    <h3 className="text-xs font-black text-zinc-705 uppercase tracking-wider">Mis Últimos 5</h3>
                    <button onClick={() => setShowOnlyCurrentCrane(!showOnlyCurrentCrane)} className={`text-[8px] px-2 py-1 rounded font-black uppercase transition-all ${showOnlyCurrentCrane ? 'bg-[#5a6e35] text-white border border-[#718b45]' : 'bg-white text-zinc-505 border border-zinc-200 hover:bg-zinc-50'}`}>
                        {showOnlyCurrentCrane ? activeSession.craneUsage.crane : 'Ver por Grúa'}
                    </button>
                </div>
                <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-zinc-200 bg-white">
                        {recentMovements.length > 0 ? recentMovements.map(m => {
                            const mStyle = getMovementStyle(m.reason);
                            return (
                                <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="font-mono font-black text-zinc-800 tracking-widest text-base">{m.containerNumber}</span>
                                                <span className="text-[9px] text-[#5a6e35] font-bold block">{m.yard}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase ${mStyle.bg} ${mStyle.text} ${mStyle.border}`}>
                                                    {mStyle.label}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 font-bold">
                                                    {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12:false})}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }) : <tr><td colSpan={2} className="px-4 py-6 text-center text-zinc-400 text-xs italic">Sin movimientos aún.</td></tr>}
                    </tbody>
                </table>
            </div>

            {isCraneModalOpen && <ChangeCraneModal onClose={() => setCraneModalOpen(false)} fetchMovements={fetchMovements} config={config} />}
            {isYardModalOpen && <ChangeYardModal onClose={() => setYardModalOpen(false)} config={config} />}
            {isWorkshopModalOpen && <WorkshopModal onClose={() => setWorkshopModalOpen(false)} />}
            {isEndSessionModalOpen && <FinalizeSessionModal onClose={() => setEndSessionModalOpen(false)} />}
            {isRackMultiplierModalOpen && (
                <Modal title="Revisión en Racks" onClose={() => setRackMultiplierModalOpen(false)}>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { processMovementExecution("Revisión en Racks", 1); setRackMultiplierModalOpen(false); }} className="p-6 bg-teal-50 border border-teal-200 text-teal-705 rounded-2xl shadow-sm active:scale-95 transition-all">
                            <span className="text-4xl font-black text-teal-600">1</span><br/><span className="text-[10px] uppercase font-bold tracking-wider">Movimiento</span>
                        </button>
                        <button onClick={() => { processMovementExecution("Revisión en Racks", 2); setRackMultiplierModalOpen(false); }} className="p-6 bg-teal-50 border border-teal-200 text-teal-705 rounded-2xl shadow-sm active:scale-95 transition-all">
                            <span className="text-4xl font-black text-teal-600">2</span><br/><span className="text-[10px] uppercase font-bold tracking-wider">Movimientos</span>
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function ChangeCraneModal({ onClose, fetchMovements, config }: { onClose: () => void, fetchMovements: () => void, config: Record<AppConfigKey, string[]> }) {
    const { activeSession, setActiveSession } = useContext(SessionContext);
    const [changeReason, setChangeReason] = useState(config.CRANE_CHANGE_REASONS[0] || 'Falla mecánica');
    const [changeDetails, setChangeDetails] = useState('');
    const [oldEndHourMeter, setOldEndHourMeter] = useState('');
    
    const [newCrane, setNewCrane] = useState('');
    const [newStartHourMeter, setNewStartHourMeter] = useState('');
    
    const [lastMeter, setLastMeter] = useState<number | undefined>(undefined);
    const [isContinuing, setIsContinuing] = useState(false);
    const [error, setError] = useState('');
    const [activeCranes, setActiveCranes] = useState<Record<string, { operator: string, yard: string }>>({});
    const [modalWarning, setModalWarning] = useState<{ targetName: string; refVal: number; key: 'old' | 'new'; crane: string; enteredVal: number; isMassiveJump?: boolean; isLower?: boolean } | null>(null);

    useEffect(() => {
        const loadActives = async () => setActiveCranes(await getAllActiveCranes());
        loadActives();
    }, []);

    useEffect(() => {
        if (newCrane && activeSession) {
            setError('');
            getLatestUsageInSession(activeSession.session.id!, newCrane).then(usage => {
                if (usage && usage.endHourMeter !== undefined) {
                    setNewStartHourMeter(usage.endHourMeter.toString().replace('.', ','));
                    setIsContinuing(true);
                } else {
                    setIsContinuing(false);
                    getLastHourMeterForCrane(newCrane).then(meter => {
                        setLastMeter(meter);
                        if (meter !== undefined) {
                            setNewStartHourMeter(meter.toString().replace('.', ','));
                        } else {
                            setNewStartHourMeter('');
                        }
                    });
                }
            });

            if (activeCranes[newCrane]) {
                setError(`⚠️ ALARMA: La grúa ${newCrane} está SIENDO USADA por ${activeCranes[newCrane].operator}.`);
            }
        }
    }, [newCrane, activeSession, activeCranes]);

    const executeChangeCraneWithBypass = async () => {
        if (!activeSession) return;
        const startVal = parseFloat(newStartHourMeter.replace(',', '.'));
        const oldEndVal = parseFloat(oldEndHourMeter.replace(',', '.'));
        try {
            const usage = await changeCrane(
                activeSession.craneUsage.id!, 
                changeReason, 
                newCrane, 
                activeSession.craneUsage.yard, 
                startVal, 
                activeSession.session.id!,
                oldEndVal,
                changeDetails
            );
            setActiveSession({ ...activeSession, craneUsage: usage });
            fetchMovements();
            onClose();
        } catch (e) { console.error(e); }
    };

    const handleConfirm = async () => {
        if (!activeSession || !newCrane || !newStartHourMeter || !oldEndHourMeter || !changeReason) {
            setError('Complete todos los campos obligatorios.');
            return;
        }

        if (changeReason === 'Falla mecánica' && !changeDetails.trim()) {
            setError('Debe indicar los detalles de la falla mecánica.');
            return;
        }
        
        const busyInfo = await checkCraneAvailability(newCrane);
        if (busyInfo) {
            setError(`🚨 BLOQUEADO: La ${newCrane} está en uso por ${busyInfo.operator}.`);
            return;
        }

        const startVal = parseFloat(newStartHourMeter.replace(',', '.'));
        const oldEndVal = parseFloat(oldEndHourMeter.replace(',', '.'));
        if (isNaN(startVal) || isNaN(oldEndVal)) {
            setError('Formato de horómetro inválido.');
            return;
        }

        // Warning validation checks
        // 1. Old crane final value checks
        if (oldEndVal < activeSession.craneUsage.startHourMeter) {
            setModalWarning({
                targetName: activeSession.craneUsage.crane,
                refVal: activeSession.craneUsage.startHourMeter,
                key: 'old',
                crane: activeSession.craneUsage.crane,
                enteredVal: oldEndVal,
                isLower: true
            });
            return;
        }

        if (oldEndVal > activeSession.craneUsage.startHourMeter + 50) {
            setModalWarning({
                targetName: activeSession.craneUsage.crane,
                refVal: activeSession.craneUsage.startHourMeter,
                key: 'old',
                crane: activeSession.craneUsage.crane,
                enteredVal: oldEndVal,
                isMassiveJump: true
            });
            return;
        }

        const oldWarning = getCraneWarning(activeSession.craneUsage.crane, oldEndVal);
        if (oldWarning) {
            setModalWarning({
                targetName: oldWarning.targetName,
                refVal: oldWarning.refVal,
                key: 'old',
                crane: activeSession.craneUsage.crane,
                enteredVal: oldEndVal
            });
            return;
        }

        // 2. New crane starting value checks
        if (!isContinuing && lastMeter !== undefined) {
            if (startVal < lastMeter) {
                setModalWarning({
                    targetName: newCrane,
                    refVal: lastMeter,
                    key: 'new',
                    crane: newCrane,
                    enteredVal: startVal,
                    isLower: true
                });
                return;
            }
            if (startVal > lastMeter + 50) {
                setModalWarning({
                    targetName: newCrane,
                    refVal: lastMeter,
                    key: 'new',
                    crane: newCrane,
                    enteredVal: startVal,
                    isMassiveJump: true
                });
                return;
            }
        }

        const newWarning = getCraneWarning(newCrane, startVal);
        if (newWarning) {
            setModalWarning({
                targetName: newWarning.targetName,
                refVal: newWarning.refVal,
                key: 'new',
                crane: newCrane,
                enteredVal: startVal
            });
            return;
        }

        await executeChangeCraneWithBypass();
    };

    if (modalWarning) {
        return (
            <Modal title="⚠️ Alerta de Horómetro" onClose={onClose}>
                <div className="space-y-6 text-center text-zinc-800">
                    <div className="w-16 h-16 bg-red-50 border border-red-200 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    
                    <div className="space-y-1">
                        <h3 className="text-base font-black text-red-600 uppercase tracking-wide">¿Grúa/Horómetro Incorrecto?</h3>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Verifique la información</p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-left space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-zinc-500 uppercase">Máquina:</span>
                          <span className="font-black text-zinc-700 uppercase">{modalWarning.crane}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-zinc-500 uppercase">Horómetro Ingresado:</span>
                          <span className="font-black text-red-600 font-mono text-base">{modalWarning.enteredVal.toString().replace('.', ',')}</span>
                        </div>

                        <p className="text-[11px] text-red-700 font-bold uppercase text-center border-t border-zinc-200 pt-2.5 leading-snug">
                            {modalWarning.isMassiveJump ? (
                                `⚠️ ¡ERROR DE DIGITACIÓN PROTEGIDO! El horómetro ingresado (${modalWarning.enteredVal.toString().replace('.', ',')}) representa un salto excesivo de más de 50 horas respecto al valor anterior de referencia (${modalWarning.refVal.toString().replace('.', ',')}). Por favor revise si omitió el punto decimal.`
                            ) : modalWarning.isLower ? (
                                `⚠️ ¡HORÓMETRO MENOR AL ANTERIOR! El valor ingresado (${modalWarning.enteredVal.toString().replace('.', ',')}) es inferior al último valor registrado de referencia (${modalWarning.refVal.toString().replace('.', ',')}). Por favor corríjalo.`
                            ) : modalWarning.targetName === modalWarning.crane ? (
                                `⚠️ El valor ingresado difiere excesivamente del rango esperado para la grúa ${modalWarning.crane} (Ref: ${modalWarning.refVal.toString().replace('.', ',')}).`
                            ) : (
                                `⚠️ ¡ATENCIÓN! Este horómetro (${modalWarning.enteredVal.toString().replace('.', ',')}) parece corresponder a la grúa ${modalWarning.targetName} (Ref: ${modalWarning.refVal.toString().replace('.', ',')}) y no a la grúa seleccionada ${modalWarning.crane}.`
                            )}
                        </p>
                    </div>

                    <div className="space-y-2 pt-2">
                        <button 
                            onClick={() => setModalWarning(null)}
                            className="w-full py-3 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 font-black rounded-xl uppercase text-xs tracking-wider transition-all"
                        >
                            ⬅️ Volver y Corregir
                        </button>
                        <button 
                            onClick={async () => {
                                setModalWarning(null);
                                await executeChangeCraneWithBypass();
                            }}
                            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl uppercase text-xs tracking-wider shadow-md active:scale-95 transition-all"
                        >
                            Confirmar (Grúa Correcta)
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title="🔄 Cambio de Grúa" onClose={onClose}>
            <div className="space-y-5 text-zinc-800">
                {error && (
                    <div className="p-3 bg-red-50 text-red-705 text-[10px] font-black rounded-lg border border-red-205 uppercase animate-pulse">
                        {error}
                    </div>
                )}
                
                <div className="space-y-3">
                    <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">Motivo del Cambio</label>
                        <select value={changeReason} onChange={e => setChangeReason(e.target.value)} className="w-full p-3 border border-zinc-200 rounded-xl bg-white text-zinc-800 outline-none focus:ring-1 focus:ring-[#e0a916] font-bold text-sm">
                            {config.CRANE_CHANGE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {changeReason === 'Falla mecánica' && (
                        <div className="animate-in slide-in-from-top-2 duration-300">
                            <label className="block text-[10px] font-black text-red-500 uppercase mb-1">Comentarios de Falla Mecánica</label>
                            <textarea 
                                value={changeDetails} 
                                onChange={e => setChangeDetails(e.target.value)} 
                                placeholder="Describa el fallo técnico..."
                                className="w-full p-3 border border-red-200 rounded-xl text-sm bg-red-50 text-red-700 placeholder-red-300 focus:outline-none focus:ring-1 focus:ring-red-500 min-h-[80px]" 
                            />
                        </div>
                    )}
                </div>

                <hr className="border-zinc-200" />

                <div className="p-4 bg-orange-50 rounded-xl border border-orange-200 space-y-3">
                    <p className="text-[10px] font-black text-orange-700 uppercase flex items-center gap-1">
                        Paso 1: Entregar {activeSession?.craneUsage.crane}
                    </p>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-black text-zinc-500 uppercase">Horómetro Final</label>
                            {changeReason === 'Falla mecánica' && activeSession && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const startObj = activeSession.craneUsage.startTime;
                                        const startMs = startObj instanceof Date ? startObj.getTime() : new Date(startObj).getTime();
                                        const elapsedHrs = (Date.now() - startMs) / (1000 * 60 * 60);
                                        const estimated = activeSession.craneUsage.startHourMeter + elapsedHrs;
                                        setOldEndHourMeter(estimated.toFixed(2).replace('.', ','));
                                    }}
                                    className="text-[10px] bg-white hover:bg-orange-100 text-orange-700 font-extrabold px-2 py-1 rounded border border-orange-200 transition-all"
                                >
                                    ⚙️ Calcular Estimado (+{((Date.now() - (activeSession.craneUsage.startTime instanceof Date ? activeSession.craneUsage.startTime.getTime() : new Date(activeSession.craneUsage.startTime).getTime())) / (1000 * 60 * 60)).toFixed(2)} hrs)
                                </button>
                            )}
                        </div>
                        <input 
                            type="text" 
                            inputMode="decimal"
                            value={oldEndHourMeter} 
                            onChange={e => setOldEndHourMeter(e.target.value.replace('.', ',').replace(/[^0-9,]/g, ''))} 
                            placeholder="0000,00"
                            className="w-full p-3 border border-zinc-200 rounded-xl font-black text-xl text-center bg-white text-zinc-800 outline-none focus:ring-1 focus:ring-[#e0a916]" 
                        />
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-[9px] text-[#e0a916] font-black uppercase">
                                {changeReason === 'Falla mecánica' ? '⏳ EXCEPCIÓN POR FALLA ACTIVA' : ''}
                            </span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase">Inicial: {activeSession?.craneUsage.startHourMeter.toString().replace('.', ',')}</span>
                        </div>
                        {changeReason === 'Falla mecánica' && (
                            <p className="text-[9px] text-red-650 font-bold uppercase mt-2 leading-relaxed bg-red-50 p-2 rounded border border-red-200">
                                ⚠️ Excepción por fallo del equipo: Si no puedes leer el horómetro real, usa el cálculo estimado de arriba. Podrá ser modificado por administración en la planilla de control si es necesario.
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-[10px] font-black text-green-700 uppercase mb-3 flex items-center gap-1">
                        Paso 2: Recibir Nueva Grúa
                    </p>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">Nueva Grúa</label>
                            <select 
                                value={newCrane} 
                                onChange={e => setNewCrane(e.target.value)} 
                                className={`w-full p-3 border rounded-xl bg-white text-zinc-805 outline-none font-bold text-sm ${activeCranes[newCrane] ? 'border-red-300 text-red-550' : 'border-zinc-200'}`}
                            >
                                <option value="">Seleccione Equipo...</option>
                                {config.CRANES.filter(c => c !== activeSession?.craneUsage.crane).map(c => (
                                    <option key={c} value={c} className={activeCranes[c] ? 'text-red-500 font-black' : ''}>
                                        {c} {activeCranes[c] ? '🔴 (OCUPADA)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">Horómetro Inicial</label>
                            <input 
                                type="text" 
                                inputMode="decimal"
                                value={newStartHourMeter} 
                                onChange={e => setNewStartHourMeter(e.target.value.replace('.', ',').replace(/[^0-9,]/g, ''))} 
                                readOnly={isContinuing} 
                                placeholder="0000,00"
                                className="w-full p-3 border border-zinc-200 rounded-xl font-black text-xl text-center bg-white text-zinc-800 outline-none" 
                            />
                            {lastMeter !== undefined && !isContinuing && (
                                <p className="text-[9px] text-blue-600 font-bold mt-1 uppercase text-right">Último reg: {lastMeter.toString().replace('.', ',')}</p>
                            )}
                        </div>
                    </div>
                </div>
                
                <button 
                    onClick={handleConfirm} 
                    disabled={!!activeCranes[newCrane] || !newCrane}
                    className={`w-full py-4 text-white rounded-xl font-black uppercase shadow-sm active:scale-95 transition-all ${!!activeCranes[newCrane] || !newCrane ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200' : 'bg-[#e0a916] text-[#0f0f10] hover:bg-[#ffbf00]'}`}
                >
                    {!!activeCranes[newCrane] ? 'EQUIPO OCUPADO' : 'Finalizar y Cambiar'}
                </button>
            </div>
        </Modal>
    );
}

function FinalizeSessionModal({ onClose }: { onClose: () => void }) {
    const { activeSession, logout } = useContext(SessionContext);
    const [pendingUsages, setPendingUsages] = useState<CraneUsage[]>([]);
    const [meters, setMeters] = useState<Record<number, string>>({});
    const [error, setError] = useState('');
    const [finalizeWarning, setFinalizeWarning] = useState<{ targetName: string; refVal: number; crane: string; enteredVal: number; isMassiveJump?: boolean; isLower?: boolean } | null>(null);

    useEffect(() => {
        if (activeSession?.session.id) {
            getPendingHourMetersForSession(activeSession.session.id).then(setPendingUsages);
        }
    }, [activeSession]);

    const executeFinalize = async (finalMeters: Record<number, number>) => {
        try {
            await endCurrentSessionWithMeters(activeSession.session.id!, finalMeters);
            logout();
        } catch (e) { console.error(e); }
    };

    const handleFinalize = async () => {
        if (!activeSession) return;
        const finalMeters: Record<number, number> = {};
        for (const usage of pendingUsages) {
            const val = parseFloat((meters[usage.id!] || '').replace(',', '.'));
            if (isNaN(val)) { setError('Complete todos los horómetros.'); return; }
            finalMeters[usage.id!] = val;
        }

        // Warning and discrepancy checks
        for (const usage of pendingUsages) {
            const val = finalMeters[usage.id!];
            
            // 1. Value is lower than the starting one
            if (val < usage.startHourMeter) {
                setFinalizeWarning({
                    targetName: usage.crane,
                    refVal: usage.startHourMeter,
                    crane: usage.crane,
                    enteredVal: val,
                    isLower: true
                });
                return;
            }

            // 2. Extremely high jump (e.g., operator entering 46285 instead of 4628.5)
            if (val > usage.startHourMeter + 50) {
                setFinalizeWarning({
                    targetName: usage.crane,
                    refVal: usage.startHourMeter,
                    crane: usage.crane,
                    enteredVal: val,
                    isMassiveJump: true
                });
                return;
            }

            // 3. Normal deviation warning compared to reference files
            const warning = getCraneWarning(usage.crane, val);
            if (warning) {
                setFinalizeWarning({
                    targetName: warning.targetName,
                    refVal: warning.refVal,
                    crane: usage.crane,
                    enteredVal: val
                });
                return;
            }
        }

        await executeFinalize(finalMeters);
    };

    if (finalizeWarning) {
        return (
            <Modal title="⚠️ Alerta de Horómetro" onClose={onClose}>
                <div className="space-y-6 text-center text-zinc-800">
                    <div className="w-16 h-16 bg-red-50 border border-red-200 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    
                    <div className="space-y-1">
                        <h3 className="text-base font-black text-red-600 uppercase tracking-wide">¿Grúa/Horómetro Incorrecto?</h3>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Verifique la información</p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-left space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-zinc-500 uppercase">Máquina:</span>
                          <span className="font-black text-zinc-700 uppercase">{finalizeWarning.crane}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-zinc-500 uppercase">Horómetro Ingresado:</span>
                          <span className="font-black text-red-600 font-mono text-base">{finalizeWarning.enteredVal.toString().replace('.', ',')}</span>
                        </div>

                        <p className="text-[11px] text-red-700 font-bold uppercase text-center border-t border-zinc-200 pt-2.5 leading-snug">
                            {finalizeWarning.isMassiveJump ? (
                                `⚠️ ¡ERROR DE DIGITACIÓN PROTEGIDO! El horómetro ingresado (${finalizeWarning.enteredVal.toString().replace('.', ',')}) representa un salto excesivo de más de 50 horas en un solo turno respecto al horómetro inicial (${finalizeWarning.refVal.toString().replace('.', ',')}). Por favor revise si omitió el punto decimal.`
                            ) : finalizeWarning.isLower ? (
                                `⚠️ ¡HORÓMETRO MENOR AL INICIAL! El valor ingresado (${finalizeWarning.enteredVal.toString().replace('.', ',')}) es inferior al horómetro inicial con el que inició el turno (${finalizeWarning.refVal.toString().replace('.', ',')}). Por favor corríjalo.`
                            ) : finalizeWarning.targetName === finalizeWarning.crane ? (
                                `⚠️ El valor ingresado difiere excesivamente del rango esperado para la grúa ${finalizeWarning.crane} (Ref: ${finalizeWarning.refVal.toString().replace('.', ',')}).`
                            ) : (
                                `⚠️ ¡ATENCIÓN! Este horómetro (${finalizeWarning.enteredVal.toString().replace('.', ',')}) parece corresponder a la grúa ${finalizeWarning.targetName} (Ref: ${finalizeWarning.refVal.toString().replace('.', ',')}) y no a la grúa seleccionada ${finalizeWarning.crane}.`
                            )}
                        </p>
                    </div>

                    <div className="space-y-2 pt-2">
                        <button 
                            onClick={() => setFinalizeWarning(null)}
                            className="w-full py-3 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 font-black rounded-xl uppercase text-xs tracking-wider transition-all"
                        >
                            ⬅️ Volver y Corregir
                        </button>
                        <button 
                            onClick={async () => {
                                const finalMeters: Record<number, number> = {};
                                for (const usage of pendingUsages) {
                                    const val = parseFloat((meters[usage.id!] || '').replace(',', '.'));
                                    finalMeters[usage.id!] = val;
                                }
                                setFinalizeWarning(null);
                                await executeFinalize(finalMeters);
                            }}
                            className="w-full py-3.5 bg-red-650 hover:bg-red-700 text-white font-black rounded-xl uppercase text-xs tracking-wider shadow-sm active:scale-95 transition-all"
                        >
                            Confirmar (Grúa Correcta)
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title="🏁 Finalizar Jornada" onClose={onClose}>
            <div className="space-y-6 text-zinc-800">
                <p className="text-xs text-zinc-500 font-bold uppercase text-center border-b border-zinc-200 pb-4">Ingrese horómetros finales para cerrar sesión</p>
                {pendingUsages.map(usage => (
                    <div key={usage.id} className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                        <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
                            <span className="text-lg font-black text-amber-705 mb-0.5">{usage.crane}</span>
                            <span className="text-[10px] font-black text-zinc-500">INICIAL: {usage.startHourMeter.toString().replace('.', ',')}</span>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase">Horómetro Final</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const startMs = usage.startTime instanceof Date ? usage.startTime.getTime() : new Date(usage.startTime).getTime();
                                        const elapsedHrs = (Date.now() - startMs) / (1000 * 60 * 60);
                                        const estimated = usage.startHourMeter + elapsedHrs;
                                        setMeters({...meters, [usage.id!]: estimated.toFixed(2).replace('.', ',')});
                                    }}
                                    className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-705 font-extrabold px-2 py-1 rounded border border-emerald-200 transition-all font-sans"
                                >
                                    🛠️ Estimar por Apagado (+{((Date.now() - (usage.startTime instanceof Date ? usage.startTime.getTime() : new Date(usage.startTime).getTime())) / (1000 * 60 * 60)).toFixed(2)} hrs)
                                </button>
                            </div>
                            <input 
                                type="text" 
                                inputMode="decimal"
                                value={meters[usage.id!] || ''} 
                                onChange={e => setMeters({...meters, [usage.id!]: e.target.value.replace('.', ',').replace(/[^0-9,]/g, '')})} 
                                placeholder="0000,00" 
                                className="w-full p-3 border border-zinc-200 rounded-lg font-black text-center text-lg bg-white text-zinc-805 outline-none focus:ring-1 focus:ring-amber-500" 
                            />
                            <p className="text-[9px] text-[#e67e22] font-bold mt-1 uppercase text-center leading-relaxed">
                                (Si la grúa se apagó por una falla mecánica, usa el botón "Estimar" para calcular el tiempo estimado transcurrido de forma automática).
                            </p>
                        </div>
                    </div>
                ))}
                {error && <p className="text-red-600 text-[10px] font-black uppercase text-center">{error}</p>}
                <div className="grid grid-cols-2 gap-3 pt-4">
                    <button onClick={onClose} className="py-3 bg-zinc-100 text-zinc-600 rounded-lg font-black uppercase hover:bg-zinc-200 transition-colors border border-zinc-200">Cancelar</button>
                    <button onClick={handleFinalize} className="py-3 bg-red-600 border border-red-700 text-white rounded-lg font-black uppercase hover:bg-red-700 transition-colors shadow-sm">Cerrar Sesión</button>
                </div>
            </div>
        </Modal>
    );
}

function ChangeYardModal({ onClose, config }: { onClose: () => void, config: Record<AppConfigKey, string[]> }) {
    const { activeSession, setActiveSession } = useContext(SessionContext);
    const [newYard, setNewYard] = useState(activeSession?.craneUsage.yard || '');
    const handleConfirm = async () => {
        if (!activeSession) return;
        await changeYard(activeSession.craneUsage.id!, newYard);
        setActiveSession({ ...activeSession, craneUsage: { ...activeSession.craneUsage, yard: newYard } });
        onClose();
    };
    return (
        <Modal title="📍 Cambiar Predio" onClose={onClose}>
            <div className="space-y-4">
                <select value={newYard} onChange={e => setNewYard(e.target.value)} className="w-full p-3 border border-zinc-200 rounded-xl bg-white text-zinc-800 outline-none focus:ring-1 focus:ring-[#e0a916] font-bold text-sm">
                    {config.YARDS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={handleConfirm} className="w-full py-3 bg-[#e0a916] hover:bg-[#ffbf00] text-[#0f0f10] font-black rounded-lg uppercase transition-colors">Confirmar</button>
            </div>
        </Modal>
    );
}

function WorkshopModal({ onClose }: { onClose: () => void }) {
    const { activeSession } = useContext(SessionContext);
    const [step, setStep] = useState<'LOADING' | 'ASK' | 'CHOOSE_OLD' | 'WRITE_NEW'>('LOADING');
    const [failuresList, setFailuresList] = useState<any[]>([]);
    const [selectedFailureForTrace, setSelectedFailureForTrace] = useState<any | null>(null);
    const [details, setDetails] = useState('');
    const [recurrenceComment, setRecurrenceComment] = useState('');
    const [severity, setSeverity] = useState<'Menor' | 'Mayor' | 'Crítico'>('Mayor');
    const [isSaving, setIsSaving] = useState(false);
    const [statusText, setStatusText] = useState('');

    useEffect(() => {
        const loadFailures = async () => {
            if (!activeSession) return;
            try {
                const all = await getCraneFailures();
                // Get all failures (active and past resolved ones) for this crane
                const matched = all.filter(f => f.crane === activeSession.craneUsage.crane);
                setFailuresList(matched);
                setStep('ASK');
            } catch (err) {
                console.error(err);
                setStep('WRITE_NEW');
            }
        };
        loadFailures();
    }, [activeSession]);

    const handleSelectOld = async (failureItem: any) => {
        if (!activeSession) return;
        setIsSaving(true);
        try {
            const now = new Date();
            const operatorName = activeSession.session.operator;
            
            // Build advanced history item
            const newHistoryItem = {
                timestamp: now,
                operator: operatorName,
                type: 'recurrence' as const,
                status: 'Pendiente' as const,
                note: recurrenceComment.trim() 
                    ? `REINCIDENCIA REPORTADA POR EL OPERADOR: ${recurrenceComment.trim()}`
                    : 'EL OPERADOR REPORTÓ REINCIDENCIA DE LA FALLA.'
            };

            const updatedHistory = [...(failureItem.history || []), newHistoryItem];

            // Set back to Pendiente with new history
            await updateCraneFailure(failureItem.id!, {
                status: 'Pendiente',
                timestamp: now,
                history: updatedHistory,
                failureType: 'Recurrente'
            });

            // Log follow-up note to workshop records
            const followUpNotes = `REINCIDENCIA: [${failureItem.itemLabel}] ${recurrenceComment ? `Nota: ${recurrenceComment}` : ''}`;
            await addWorkshopRecord({
                sessionId: activeSession.session.id!,
                craneUsageId: activeSession.craneUsage.id!,
                timestamp: now,
                crane: activeSession.craneUsage.crane,
                details: followUpNotes
            });
            
            setStatusText('✅ Reporte de Falla Recurrente Sincronizado.');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitNew = async () => {
        if (!activeSession || !details.trim()) return;
        setIsSaving(true);
        try {
            const now = new Date();
            const operatorName = activeSession.session.operator;

            const initialHistoryItem = {
                timestamp: now,
                operator: operatorName,
                type: 'reported' as const,
                status: 'Pendiente' as const,
                note: `FALLA REGISTRADA COMO NUEVA: ${details.trim()}`
            };

            // 1. Create failure record
            await addManualCraneFailure({
                sessionId: activeSession.session.id!,
                craneUsageId: activeSession.craneUsage.id!,
                crane: activeSession.craneUsage.crane,
                operator: operatorName,
                itemKey: 'manual_report',
                itemLabel: details.trim(),
                score: severity === 'Crítico' ? 1 : severity === 'Mayor' ? 2 : 3,
                severity: severity,
                status: 'Pendiente',
                isCustomManualReport: true,
                failureType: 'Nueva',
                firstReportedAt: now,
                history: [initialHistoryItem]
            });

            // 2. Add workshop record
            await addWorkshopRecord({
                sessionId: activeSession.session.id!,
                craneUsageId: activeSession.craneUsage.id!,
                timestamp: now,
                crane: activeSession.craneUsage.crane,
                details: `Nueva Falla [${severity}]: ${details.trim()}`
            });

            setStatusText('✅ Nueva Falla Reportada Correctamente.');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title="⚠️ REPORTAR FALLAS EN EQUIPO" onClose={onClose}>
            <div className="space-y-4 text-zinc-900 font-sans">
                {/* Header context card */}
                <div className="p-3 bg-zinc-900 text-white rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">MÁQUINA BAJO REPORTE</p>
                    <p className="text-base font-black uppercase text-amber-400">{activeSession?.craneUsage.crane}</p>
                </div>

                {statusText && (
                    <div className="p-4 bg-green-50 text-green-800 text-xs font-black uppercase rounded-lg border border-green-200 animate-pulse text-center">
                        {statusText}
                    </div>
                )}

                {step === 'LOADING' && !statusText && (
                    <div className="text-center py-6">
                        <div className="w-8 h-8 border-4 border-[#e67e22] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-xs font-black uppercase text-zinc-500">Buscando fallas existentes...</p>
                    </div>
                )}

                {step === 'ASK' && !statusText && (
                    <div className="space-y-3.5 pt-1">
                        <div className="text-center space-y-1 py-1">
                            <h4 className="text-xs font-black uppercase text-zinc-700 tracking-wide">¿Esta falla ya existía o es nueva de hoy?</h4>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase">
                                Se encontraron {failuresList.filter(f => f.status !== 'Resuelto').length} fallas activas y {failuresList.filter(f => f.status === 'Resuelto').length} fallas solucionadas anteriormente.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                type="button"
                                onClick={() => setStep('CHOOSE_OLD')}
                                className="w-full text-left p-4 bg-amber-500/10 hover:bg-amber-500/20 border-2 border-amber-500/30 hover:border-amber-500 rounded-xl transition-all flex items-start gap-3 group active:scale-98 cursor-pointer border-dashed"
                            >
                                <span className="text-2xl mt-0.5">🔄</span>
                                <div className="space-y-0.5">
                                    <h5 className="text-xs font-black text-amber-800 uppercase tracking-wide">Falla Antigua / Recurrente</h5>
                                    <p className="text-[9px] text-amber-700 font-bold uppercase leading-tight">La falla ya ocurrió anteriormente (activa o solucionada que volvió a fallar).</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('WRITE_NEW')}
                                className="w-full text-left p-4 bg-zinc-50 hover:bg-zinc-100 border-2 border-zinc-200 hover:border-zinc-300 rounded-xl transition-all flex items-start gap-3 group active:scale-98 cursor-pointer border-dashed"
                            >
                                <span className="text-2xl mt-0.5">➕</span>
                                <div className="space-y-0.5">
                                    <h5 className="text-xs font-black text-zinc-700 uppercase tracking-wide">Daño Nuevo / Reportar Falla</h5>
                                    <p className="text-[9px] text-zinc-400 font-bold uppercase leading-tight">Escribir un nuevo reporte técnico para una falla que ocurre por primera vez.</p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {step === 'CHOOSE_OLD' && !statusText && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                            <div>
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Fallas recurrentes</span>
                                <span className="text-[11px] font-bold text-slate-600">Seleccione de la lista para ver su trazabilidad:</span>
                            </div>
                            <button onClick={() => { setSelectedFailureForTrace(null); setStep('ASK'); }} className="text-[10px] text-zinc-500 hover:text-zinc-800 font-bold uppercase tracking-wider bg-zinc-100 px-2 py-1 rounded-lg">⬅️ Volver</button>
                        </div>

                        {selectedFailureForTrace ? (
                            <div className="space-y-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex gap-1.5 items-center">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                selectedFailureForTrace.severity === 'Crítico' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                            }`}>{selectedFailureForTrace.severity}</span>
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                selectedFailureForTrace.status === 'Resuelto' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                            }`}>{selectedFailureForTrace.status}</span>
                                        </div>
                                        <h5 className="text-sm font-black text-zinc-800 uppercase mt-1 leading-tight">{selectedFailureForTrace.itemLabel}</h5>
                                        <p className="text-[9px] text-zinc-500 font-bold uppercase mt-0.5">
                                            Primer reporte: {new Date(selectedFailureForTrace.firstReportedAt || selectedFailureForTrace.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedFailureForTrace(null)}
                                        className="text-[9px] bg-zinc-200 hover:bg-zinc-300 px-2 py-0.5 rounded font-black text-zinc-700 uppercase"
                                    >
                                        Cambiar
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">Historial de Trazabilidad:</span>
                                    <div className="max-h-[140px] overflow-y-auto space-y-2 border-l-2 border-amber-500 pl-3 py-1 bg-white p-2 rounded-lg">
                                        {(selectedFailureForTrace.history || []).length > 0 ? (
                                            selectedFailureForTrace.history.map((h: any, i: number) => (
                                                <div key={i} className="text-[11px] leading-tight space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-zinc-800">{new Date(h.timestamp).toLocaleString()}</span>
                                                        <span className="text-[8px] bg-slate-100 text-slate-600 px-1 rounded uppercase font-black">{h.operator}</span>
                                                    </div>
                                                    <p className="text-zinc-650 italic font-medium">{h.note || 'Sin comentarios'}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-[11px] text-zinc-400 italic">
                                                Registrada inicialmente por {selectedFailureForTrace.operator} el {new Date(selectedFailureForTrace.timestamp).toLocaleString()}.
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[9px] text-zinc-450 font-bold uppercase leading-snug">
                                        ⏱️ Reportada originalmente hace {Math.max(1, Math.round((new Date().getTime() - new Date(selectedFailureForTrace.firstReportedAt || selectedFailureForTrace.timestamp).getTime()) / (1000 * 60 * 60 * 24)))} días.
                                    </p>
                                </div>

                                <div className="space-y-1 pt-1 border-t border-zinc-200">
                                    <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-wider">Comentarios de Reincidencia (Nuevos Síntomas):</label>
                                    <textarea
                                        value={recurrenceComment}
                                        onChange={(e) => setRecurrenceComment(e.target.value)}
                                        placeholder="Ej: Volvió a presentar ruidos fuertes y fuga persistente durante la operación..."
                                        className="w-full p-2.5 border-2 border-zinc-300 rounded-lg bg-white text-zinc-900 text-xs font-semibold uppercase min-h-[50px] outline-none focus:border-amber-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleSelectOld(selectedFailureForTrace)}
                                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 border-none cursor-pointer"
                                >
                                    {isSaving ? 'Actualizando Historial...' : '⚠️ Registrar Reincidencia'}
                                </button>
                            </div>
                        ) : (
                            <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                                {failuresList.length === 0 ? (
                                    <div className="text-center py-6 text-zinc-450 text-xs font-bold uppercase">
                                        No hay fallas previas registradas para este equipo.
                                    </div>
                                ) : (
                                    failuresList.map((failure, idx) => {
                                        const isAct = failure.status !== 'Resuelto';
                                        return (
                                            <button
                                                key={failure.id || idx}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedFailureForTrace(failure);
                                                    setRecurrenceComment('');
                                                }}
                                                className="w-full text-left p-3 bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-350 rounded-xl transition-all flex items-center justify-between gap-2.5 cursor-pointer"
                                            >
                                                <div className="space-y-0.5 flex-1 pr-1">
                                                    <div className="flex gap-1.5 items-center">
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                            failure.severity === 'Crítico' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                        }`}>{failure.severity}</span>
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                            isAct ? 'bg-orange-100 text-orange-700' : 'bg-green-150 text-zinc-700 border border-zinc-300'
                                                        }`}>{failure.status}</span>
                                                    </div>
                                                    <h5 className="text-xs font-black text-zinc-800 uppercase tracking-wide mt-1 leading-tight">{failure.itemLabel}</h5>
                                                    <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">
                                                        Reporte Inicial: {new Date(failure.firstReportedAt || failure.timestamp).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <span className="text-blue-600 text-[9px] font-black shrink-0 bg-blue-50 px-2 py-1 rounded uppercase">VER HISTORIAL ➔</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                )}

                {step === 'WRITE_NEW' && !statusText && (
                    <div className="space-y-3 pt-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Describa la Falla:</span>
                            <button type="button" onClick={() => setStep('ASK')} className="text-[10px] text-zinc-500 hover:text-zinc-800 font-bold uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded">⬅️ Volver</button>
                        </div>

                        {/* Severity select for new reports */}
                        <div className="space-y-1">
                            <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-wide">Prioridad de Falla</label>
                            <div className="grid grid-cols-3 gap-1.5 text-center">
                                {(['Crítico', 'Mayor', 'Menor'] as const).map((s) => {
                                    const isSel = severity === s;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setSeverity(s)}
                                            className={`py-1.5 text-[10px] font-black uppercase rounded-lg border transition-all h-9 flex items-center justify-center cursor-pointer ${
                                                isSel 
                                                    ? s === 'Crítico' 
                                                        ? 'bg-rose-600 border-rose-600 text-white' 
                                                        : s === 'Mayor' 
                                                            ? 'bg-orange-500 border-orange-500 text-white'
                                                            : 'bg-yellow-500 border-yellow-500 text-black'
                                                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* TextArea styled as bg-white text-black font-semibold strictly so no gray letters are typed */}
                        <div className="space-y-1">
                            <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-wide">Escriba el Detalle:</label>
                            <textarea 
                                value={details} 
                                onChange={(e) => setDetails(e.target.value)} 
                                required
                                placeholder="Ej. Fuga de aceite en mangueras de tornamesa o ruidos al subir boom..." 
                                className="w-full p-3.5 border-2 border-zinc-300 rounded-xl bg-white text-black placeholder-zinc-400 text-xs font-semibold uppercase min-h-[100px] focus:border-orange-500 outline-none transition-all" 
                            />
                        </div>

                        <button 
                            type="button"
                            onClick={handleSubmitNew} 
                            disabled={isSaving || !details.trim()}
                            className="w-full py-3.5 bg-orange-600 hover:bg-orange-750 text-white rounded-xl font-black uppercase shadow-sm active:scale-95 transition-all text-xs tracking-wider cursor-pointer mt-2 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed border-none"
                        >
                            {isSaving ? 'Guardando Reporte...' : 'Enviar Reporte de Falla'}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

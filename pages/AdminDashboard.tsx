import React, { useState, useEffect, useCallback } from 'react';
import { findLastMovementByContainer, getAppConfig, subscribeToAppConfig, subscribeToGoogleScriptUrl, saveGoogleScriptUrl, getPublicDashboardData } from '../services/db';
import { getAIOperationalSummary, queryAIAssistant } from '../services/ai';
import { Movement, AppConfigKey } from '../types';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { Sparkles, Bot, Send, RefreshCw, Cpu } from 'lucide-react';

interface AdminDashboardProps {
    setView: (view: 'LOGIN' | 'OPERATOR') => void;
}

const MetricItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
    return (
        <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-zinc-200">{value}</p>
        </div>
    );
};

const AdminSection: React.FC<{ title: string; icon?: string; children: React.ReactNode }> = ({ title, icon, children }) => {
    return (
        <section className="bg-[#0a1d37] p-8 rounded-3xl shadow-xl border border-[#112a4d]">
            <h2 className="text-xl font-black mb-6 text-[#e67e22] flex items-center gap-3 uppercase tracking-tighter italic">
                <span className="text-2xl">{icon}</span>
                {title}
            </h2>
            {children}
        </section>
    );
};

export default function AdminDashboard({ setView }: AdminDashboardProps) {
    const [containerNumber, setContainerNumber] = useState('');
    const [searchResult, setSearchResult] = useState<Movement | null | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [config, setConfig] = useState<Record<AppConfigKey, string[]>>({
        OPERATORS: [], SHIFTS: [], WORK_TYPES: [], CLIENTS: [], CRANES: [], YARDS: [],
        MOVEMENT_REASONS: [], CRANE_CHANGE_REASONS: []
    });
    const [googleScriptUrl, setGoogleScriptUrl] = useState('');
    const [isSavingUrl, setIsSavingUrl] = useState(false);

    // AI Operational Analysis State
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiChatMessages, setAiChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
    const [isChatSending, setIsChatSending] = useState(false);

    const handleGenerateAISummary = async () => {
        setIsGeneratingSummary(true);
        try {
            const metrics = await getPublicDashboardData();
            const res = await getAIOperationalSummary(metrics, 'Operaciones del Mes / Turno Actual');
            if (res.success && res.summary) {
                setAiSummary(res.summary);
            } else {
                setAiSummary(`⚠️ No fue posible generar el informe: ${res.error || 'Verifique la clave de API o conexión.'}`);
            }
        } catch (err: any) {
            setAiSummary(`⚠️ Error: ${err.message || 'Error inesperado.'}`);
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleSendAIChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiChatInput.trim() || isChatSending) return;

        const userMsg = aiChatInput.trim();
        setAiChatInput('');
        setAiChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setIsChatSending(true);

        try {
            const res = await queryAIAssistant(userMsg, {
                system: 'TG Movimientos de Grúa',
                operators: config.OPERATORS,
                cranes: config.CRANES,
                yards: config.YARDS
            });

            if (res.success && res.reply) {
                setAiChatMessages(prev => [...prev, { sender: 'ai', text: res.reply }]);
            } else {
                setAiChatMessages(prev => [...prev, { sender: 'ai', text: `⚠️ Error: ${res.error || 'No se pudo obtener respuesta.'}` }]);
            }
        } catch (err: any) {
            setAiChatMessages(prev => [...prev, { sender: 'ai', text: `⚠️ Error: ${err.message || 'Fallo de conexión.'}` }]);
        } finally {
            setIsChatSending(false);
        }
    };

    const fetchConfig = useCallback(async () => {
        const appConfig = await getAppConfig();
        setConfig(appConfig);
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToAppConfig(setConfig);
        const unsubscribeUrl = subscribeToGoogleScriptUrl(setGoogleScriptUrl);
        return () => {
            unsubscribe();
            unsubscribeUrl();
        };
    }, []);

    const handleSaveScriptUrl = async () => {
        if (!googleScriptUrl) {
            alert('Por favor, ingrese una URL válida.');
            return;
        }
        setIsSavingUrl(true);
        try {
            await saveGoogleScriptUrl(googleScriptUrl);
            alert('URL de Google Sheets actualizada exitosamente en tiempo real.');
        } catch (error) {
            console.error('Error al guardar URL:', error);
            alert('Hubo un error al guardar la URL.');
        } finally {
            setIsSavingUrl(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^\d{7}$/.test(containerNumber)) {
            alert("Ingrese 7 dígitos.");
            return;
        }
        setIsLoading(true);
        const result = await findLastMovementByContainer(containerNumber);
        setSearchResult(result);
        setIsLoading(false);
    };

    return (
        <div className="container mx-auto p-4 space-y-8 max-w-7xl min-h-screen bg-[#040a16] text-[#eaeaea]">
            <header className="flex flex-col md:flex-row justify-between items-center gap-4 bg-[#0a1d37] p-6 rounded-2xl shadow-2xl border-b-4 border-[#5a6e35] border border-[#112a4d]">
                <div className="flex items-center gap-4">
                    <div className="bg-[#102d54] p-3 rounded-xl shadow-lg border border-[#143159]">
                        <svg className="w-8 h-8 text-[#5a6e35]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none italic font-sans">Panel Administrativo</h1>
                        <p className="text-xs font-bold text-[#5a6e35] mt-1">Gestión de Operaciones Portuarias</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button 
                        onClick={() => setView('LOGIN')} 
                        className="px-5 py-2.5 bg-[#030912] text-zinc-300 border border-[#112a4d] rounded-xl hover:bg-[#071529] font-bold transition-all uppercase text-xs tracking-wider cursor-pointer"
                    >
                        Regresar al Inicio
                    </button>
                    <button 
                        onClick={async () => {
                            if (window.confirm("¿Seguro que desea cerrar sesión de Google y salir de la aplicación?")) {
                                await signOut(auth);
                                setView('LOGIN');
                            }
                        }} 
                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all uppercase text-xs tracking-wider cursor-pointer"
                    >
                        🚪 Cerrar Sesión / Salir
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <AdminSection title="Consulta de Contenedor" icon="🔍">
                        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
                            <input 
                                type="text" 
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={containerNumber} 
                                onChange={e => setContainerNumber(e.target.value.replace(/\D/g,'').slice(0,7))} 
                                className="flex-grow p-4 bg-[#030912] border border-[#112a4d] rounded-xl font-mono text-xl font-bold tracking-widest focus:border-[#5a6e35] text-white outline-none" 
                                placeholder="7 DÍGITOS"
                            />
                            <button type="submit" className="px-6 bg-[#5a6e35] hover:bg-[#718b45] text-white rounded-xl font-black shadow-lg border border-[#718b45] transition-all" disabled={isLoading}>BUSCAR</button>
                        </form>
                        {searchResult !== undefined && (
                            <div className="p-6 bg-[#030912] border border-[#112a4d] rounded-2xl animate-in fade-in zoom-in duration-300">
                                {searchResult === null ? (
                                    <p className="text-center text-zinc-500 font-bold py-4">No se encontraron registros.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-[#112a4d] pb-2">
                                            <span className="text-xs font-black text-[#e67e22] uppercase">Último Movimiento</span>
                                            <span className="text-xs font-bold bg-[#291206] text-[#ff804d] border border-[#662c0e] px-2.5 py-1 rounded font-mono">{new Date(searchResult.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <MetricItem label="Operador" value={searchResult.operator} />
                                            <MetricItem label="Hora" value={new Date(searchResult.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})} />
                                            <MetricItem label="Grúa" value={searchResult.crane} />
                                            <MetricItem label="Motivo" value={searchResult.reason} />
                                            <div className="col-span-2">
                                                <MetricItem label="Cliente" value={searchResult.client || ''} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </AdminSection>
                </div>

                <div className="lg:col-span-2 space-y-8">
                    {/* Section: AI Operational Intelligence */}
                    <AdminSection title="Inteligencia Operacional IA (Gemini 3.8 Flash)" icon="🤖">
                        <div className="space-y-6">
                            <div className="p-6 bg-[#071529] border border-indigo-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-indigo-400" />
                                        <h3 className="text-base font-black text-indigo-300 uppercase">
                                            Auditoría & Análisis Ejecutivo con IA
                                        </h3>
                                    </div>
                                    <p className="text-xs text-zinc-300 leading-relaxed">
                                        Analiza en segundos la eficiencia de grúas, cuellos de botella en patios y productividad de operadores usando los modelos más avanzados de Google GenAI.
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerateAISummary}
                                    disabled={isGeneratingSummary}
                                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
                                >
                                    {isGeneratingSummary ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Analizando Datos...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Cpu className="w-4 h-4" />
                                            <span>Generar Informe IA</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {aiSummary && (
                                <div className="p-6 bg-[#030912] border border-indigo-500/30 rounded-2xl space-y-3 animate-in fade-in duration-300">
                                    <div className="flex justify-between items-center border-b border-[#112a4d] pb-2">
                                        <span className="text-xs font-black text-indigo-400 uppercase flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Informe Ejecutivo Generado
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase">Gemini 3.8 Flash</span>
                                    </div>
                                    <div className="text-xs text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap">
                                        {aiSummary}
                                    </div>
                                </div>
                            )}

                            {/* AI Chat Assistant */}
                            <div className="p-6 bg-[#030912] border border-[#112a4d] rounded-2xl space-y-4">
                                <h4 className="text-xs font-black text-[#e67e22] uppercase tracking-widest flex items-center gap-2">
                                    <Bot className="w-4 h-4" />
                                    Consultar al Asistente Operacional
                                </h4>
                                
                                {aiChatMessages.length > 0 && (
                                    <div className="max-h-60 overflow-y-auto space-y-3 p-3 bg-[#0a1d37]/40 rounded-xl border border-[#112a4d]">
                                        {aiChatMessages.map((msg, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-3 rounded-xl text-xs leading-relaxed ${
                                                    msg.sender === 'user'
                                                        ? 'bg-[#102d54] text-white ml-6 border border-[#143159]'
                                                        : 'bg-[#061222] text-indigo-200 mr-6 border border-indigo-900/40'
                                                }`}
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-wider block mb-1 opacity-70">
                                                    {msg.sender === 'user' ? 'Administrador' : 'Asistente IA (Gemini)'}
                                                </span>
                                                <p className="whitespace-pre-wrap">{msg.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <form onSubmit={handleSendAIChat} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={aiChatInput}
                                        onChange={(e) => setAiChatInput(e.target.value)}
                                        placeholder="Pregunte sobre procedimientos, asignación de grúas o cálculo de horómetros..."
                                        className="flex-grow p-3 bg-[#0a1d37] text-white text-xs border border-[#112a4d] rounded-xl outline-none focus:border-indigo-500 transition-all"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isChatSending || !aiChatInput.trim()}
                                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Enviar</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    </AdminSection>

                    <AdminSection title="Consolidación de Datos" icon="☁️">
                        <div className="p-6 bg-[#0c2415] border border-[#1f5934] rounded-2xl flex items-center gap-6 mb-4">
                            <div className="bg-[#1f5934] p-4 rounded-2xl text-[#39ff84]">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-[#39ff84] uppercase">Google Sheets Live</h3>
                                <p className="text-sm text-emerald-300/80 font-medium leading-relaxed">Toda la información consolidada se sincroniza automáticamente en tiempo real con la hoja de cálculo corporativa. No es necesario realizar exportaciones manuales.</p>
                            </div>
                        </div>

                        <div className="p-4 bg-[#0a1d37]/40 border border-[#112a4d]/60 rounded-xl mb-6">
                            <p className="text-[10px] font-black text-[#e67e22] uppercase mb-1 tracking-widest">⚡ Base de Datos en Tiempo Real Activa</p>
                            <p className="text-xs text-zinc-300 font-bold leading-relaxed">Los cambios en la configuración (operadores, jornadas, grúas, etc.) se guardan automáticamente en la nube (Firestore) y se sincronizan al instante en todos los dispositivos activos.</p>
                        </div>

                        <div className="p-6 bg-[#030912] border border-[#112a4d] rounded-2xl">
                            <h4 className="text-xs font-black text-[#e67e22] uppercase tracking-widest mb-3 flex items-center gap-2">
                                🔑 URL de Google Apps Script (Sheets)
                            </h4>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    value={googleScriptUrl}
                                    onChange={(e) => setGoogleScriptUrl(e.target.value)}
                                    placeholder="https://script.google.com/macros/s/.../exec"
                                    className="flex-grow p-3 bg-[#0a1d37] hover:bg-[#0a1d37]/80 text-white text-xs font-mono border border-[#112a4d] rounded-xl outline-none focus:border-[#5a6e35] transition-all"
                                />
                                <button
                                    onClick={handleSaveScriptUrl}
                                    disabled={isSavingUrl}
                                    className="px-5 py-3 bg-[#5a6e35] hover:bg-[#718b45] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg select-none disabled:opacity-50 cursor-pointer"
                                >
                                    {isSavingUrl ? 'Guardando...' : 'Actualizar URL'}
                                </button>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-bold mt-2 leading-relaxed">
                                Pegue la URL de la aplicación web de Google Apps Script para registrar todos los movimientos en tiempo real en todos los dispositivos.
                            </p>
                        </div>
                    </AdminSection>

                    <div className="bg-[#0a1d37] rounded-3xl border border-[#112a4d] overflow-hidden">
                        <ConfigManager config={config} onConfigChange={fetchConfig} />
                    </div>
                </div>
            </div>
        </div>
    );
}

const ConfigManager: React.FC<{ config: Record<AppConfigKey, string[]>; onConfigChange: () => void }> = ({ config, onConfigChange }) => {
    const [editableConfig, setEditableConfig] = useState(config);
    useEffect(() => { setEditableConfig(config); }, [config]);

    const handleAddItem = (key: AppConfigKey, value: string) => {
        if (value && !editableConfig[key].includes(value)) {
            setEditableConfig(prev => ({ ...prev, [key]: [...prev[key], value] }));
        }
    };

    const handleRemoveItem = (key: AppConfigKey, value: string) => {
        setEditableConfig(prev => ({ ...prev, [key]: prev[key].filter(i => i !== value) }));
    };

    const handleSave = async (key: AppConfigKey) => {
        try {
            const { updateAppConfig: updateDbConfig } = await import('../services/db');
            await updateDbConfig(key, editableConfig[key]);
            alert(`"${key}" actualizado correctamente.`);
            onConfigChange();
        } catch (e) { alert("Error al guardar."); }
    };

    return (
        <section className="p-8">
            <h2 className="text-xl font-black mb-6 text-[#e67e22] flex items-center gap-3 uppercase tracking-tighter italic">
                <span className="text-2xl">⚙️</span>
                Mantenimiento de Variables del Sistema
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.keys(editableConfig).map((key) => (
                    <ConfigSection key={key} configKey={key as AppConfigKey} values={editableConfig[key as AppConfigKey]} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} onSave={handleSave} />
                ))}
            </div>
        </section>
    );
};

const ConfigSection: React.FC<{ configKey: AppConfigKey; values: string[]; onAddItem: any; onRemoveItem: any; onSave: any }> = ({ configKey, values, onAddItem, onRemoveItem, onSave }) => {
    const [newItem, setNewItem] = useState('');
    const titleMap: any = { OPERATORS: 'Operadores', SHIFTS: 'Turnos', WORK_TYPES: 'Jornadas', CRANES: 'Grúas', YARDS: 'Predios', CLIENTS: 'Clientes', MOVEMENT_REASONS: 'Razones Movimiento', CRANE_CHANGE_REASONS: 'Razones Cambio Grúa' };

    return (
        <div className="p-5 border border-[#112a4d] rounded-2xl bg-[#030912] flex flex-col hover:border-[#5a6e35]/40 transition-colors">
            <h3 className="font-black mb-4 text-[#e67e22] uppercase text-xs tracking-widest">{titleMap[configKey]}</h3>
            <ul className="flex-grow h-40 overflow-y-auto mb-4 space-y-2 pr-2 scrollbar-thin">
                {values.map(item => (
                    <li key={item} className="flex justify-between items-center bg-[#0a1d37] p-3 rounded-xl border border-[#112a4d] shadow-sm text-sm font-bold text-zinc-300">
                        <span>{item}</span>
                        <button onClick={() => onRemoveItem(configKey, item)} className="text-red-400 hover:text-red-500 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="flex gap-2 mb-3">
                <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} className="flex-grow p-3 bg-[#0a1d37] text-white border border-[#112a4d] rounded-xl text-xs font-bold outline-none focus:border-[#5a6e35] focus:ring-1 focus:ring-[#5a6e35]" placeholder="NUEVO VALOR..."/>
                <button onClick={() => { onAddItem(configKey, newItem); setNewItem(''); }} className="px-4 bg-[#5a6e35] text-white border border-[#718b45] rounded-xl font-black shadow-lg hover:scale-105 transition-all text-sm">+</button>
            </div>
            <button onClick={() => onSave(configKey)} className="w-full py-3 bg-[#5a6e35] hover:bg-[#718b45] text-white border border-[#718b45] rounded-xl font-black text-xs shadow-lg transition-all uppercase tracking-widest">Guardar Cambios</button>
        </div>
    );
};

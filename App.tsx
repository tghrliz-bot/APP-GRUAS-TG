
import React, { useState, useMemo, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import OperatorDashboard from './pages/OperatorDashboard';
import CraneInspectionPage from './pages/CraneInspectionPage';
import AdminDashboard from './pages/AdminDashboard';
import MechanicsDashboard from './pages/MechanicsDashboard';
import { SessionContext } from './contexts/SessionContext';
import { ActiveSession } from './types';
import { initializeDb, getActiveSessionFromDb, getCraneInspectionByUsageId } from './services/db';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [view, setView] = useState<'LOGIN' | 'OPERATOR' | 'ADMIN' | 'MECHANICS'>('LOGIN');
  const [isDbInitialized, setIsDbInitialized] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasInspection, setHasInspection] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const init = async () => {
      await initializeDb();
      
      // Intentar restaurar sesión activa de la DB si existe
      const recoveredSession = await getActiveSessionFromDb();
      if (recoveredSession) {
          setActiveSession(recoveredSession);
          setView('OPERATOR');
      }
      
      setIsDbInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    const checkInspection = async () => {
      if (activeSession && activeSession.craneUsage && activeSession.craneUsage.id !== undefined) {
        const inspection = await getCraneInspectionByUsageId(activeSession.craneUsage.id);
        setHasInspection(!!inspection);
      } else {
        setHasInspection(false);
      }
    };
    checkInspection();
  }, [activeSession]);

  const contextValue = useMemo(() => ({
    activeSession,
    setActiveSession,
    logout: () => {
      setActiveSession(null);
      setView('LOGIN');
    },
  }), [activeSession]);

  const renderView = () => {
    if (!isDbInitialized || !isAuthReady) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#040a16] text-[#eaeaea]">
          <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-[#5a6e35] border-t-transparent rounded-full animate-spin mb-4"></div>
              <h1 className="text-xl font-bold text-zinc-300 uppercase tracking-tighter italic">Cargando Sistema...</h1>
          </div>
        </div>
      );
    }

    if (view === 'OPERATOR' && activeSession) {
      if (!hasInspection) {
        return <CraneInspectionPage activeSession={activeSession} onComplete={() => setHasInspection(true)} />;
      }
      return <OperatorDashboard setView={setView} />;
    }
    if (view === 'ADMIN') {
      return <AdminDashboard setView={setView} />;
    }
    if (view === 'MECHANICS') {
      return <MechanicsDashboard onBack={() => setView('LOGIN')} />;
    }
    return <LoginPage setView={setView} />;
  };

  return (
    <SessionContext.Provider value={contextValue}>
      <div className={`min-h-screen transition-colors duration-300 ${view === 'OPERATOR' ? 'bg-[#040a16] text-[#eaeaea]' : 'bg-[#040a16] text-[#eaeaea]'}`}>
        {renderView()}
      </div>
    </SessionContext.Provider>
  );
}

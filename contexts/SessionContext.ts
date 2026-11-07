
// Fix: Import React to make React.Dispatch and React.SetStateAction available.
import React, { createContext } from 'react';
import { ActiveSession } from '../types';

interface SessionContextType {
  activeSession: ActiveSession | null;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  logout: () => void;
}

export const SessionContext = createContext<SessionContextType>({
  activeSession: null,
  setActiveSession: () => {},
  logout: () => {},
});
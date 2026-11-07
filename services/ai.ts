/**
 * AI Service for TG Movimientos de Grúa
 * Connects securely to server-side Gemini API endpoints powered by the latest @google/genai SDK & gemini-3.8-flash model.
 */

export interface AIDiagnosisResult {
  success: boolean;
  analysis: string;
  model: string;
  error?: string;
}

export interface AIOperationalSummaryResult {
  success: boolean;
  summary: string;
  model: string;
  error?: string;
}

export interface AIChatResult {
  success: boolean;
  reply: string;
  model: string;
  error?: string;
}

/**
 * Generate technical diagnosis and root-cause analysis for crane workshop records.
 */
export async function getAIDiagnosis(crane: string, details: string, history?: any): Promise<AIDiagnosisResult> {
  try {
    const res = await fetch('/api/ai/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crane, details, history }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error del servidor (${res.status})`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Error fetching AI diagnosis:', err);
    return {
      success: false,
      analysis: '',
      model: 'gemini-3.8-flash',
      error: err.message || 'No fue posible conectar con el servicio de IA.',
    };
  }
}

/**
 * Generate an executive operational and efficiency summary from shift data.
 */
export async function getAIOperationalSummary(stats: any, period?: string): Promise<AIOperationalSummaryResult> {
  try {
    const res = await fetch('/api/ai/operational-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats, period }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error del servidor (${res.status})`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Error fetching AI operational summary:', err);
    return {
      success: false,
      summary: '',
      model: 'gemini-3.8-flash',
      error: err.message || 'No fue posible conectar con el servicio de IA.',
    };
  }
}

/**
 * Operational chat assistant query.
 */
export async function queryAIAssistant(message: string, context?: any): Promise<AIChatResult> {
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error del servidor (${res.status})`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Error querying AI assistant:', err);
    return {
      success: false,
      reply: '',
      model: 'gemini-3.8-flash',
      error: err.message || 'No fue posible conectar con el servicio de IA.',
    };
  }
}

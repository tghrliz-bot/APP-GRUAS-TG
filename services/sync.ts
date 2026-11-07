
const GOOGLE_SCRIPT_URL = (import.meta as any).env.VITE_GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwxOFcAw68PV4sreHWvyNpyHNRvnauMvdtBvZBFPZ6YQwkcegtHKzWpXiZZL4ofXJRl/exec';

export interface GoogleSheetsPayload {
    FECHA: string;
    HORA: string;
    JORNADA: string;
    ACCION: string;
    OPERADOR: string;
    GRUA: string;
    PREDIO: string;
    CLIEN: string;
    CONTENE: string;
    MOTIVO: string;
    comentarios_falla: string;
    HORÓMETRO: string;
}

/**
 * Envía un payload JSON al Google Apps Script configurado.
 */
export const syncToGoogleSheets = async (payload: GoogleSheetsPayload, customUrl?: string): Promise<boolean> => {
    try {
        const url = customUrl || GOOGLE_SCRIPT_URL;
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload),
        });
        return true;
    } catch (error) {
        console.error('Error sincronizando con Google Sheets:', error);
        return false;
    }
};

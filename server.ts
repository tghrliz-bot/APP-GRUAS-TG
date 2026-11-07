import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// ----------------------------------------------------
// AI API Endpoints (Powered by latest gemini-3.8-flash)
// ----------------------------------------------------

// 1. Diagnostics and Root-Cause Analysis for Crane Workshop/Mechanical Records
app.post('/api/ai/diagnose', async (req, res) => {
  try {
    const { crane, details, history } = req.body;
    if (!crane || !details) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (crane, details).' });
    }

    const ai = getGenAI();
    const prompt = `Actúa como un Ingeniero Mecánico Especialista en Grúas Portuarias y Equipos Pesados (RTG, STS, ReachStackers).
Analiza el siguiente reporte de taller/falla mecánica:
- Grúa: ${crane}
- Falla reportada / Observación: ${details}
${history ? `- Historial reciente del equipo: ${JSON.stringify(history)}` : ''}

Por favor proporciona un análisis técnico estructurado con:
1. Diagnóstico probable y causa raíz.
2. Nivel de criticidad (Bajo / Medio / Alto / Crítico).
3. Acciones correctivas inmediatas recomendadas.
4. Recomendaciones de mantenimiento preventivo para evitar recurrencia.

Responde de forma clara, profesional y concisa en español.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Eres el Asistente Experto en Mantenimiento y Operaciones de Grúas Portuarias.',
        temperature: 0.2,
      },
    });

    res.json({
      success: true,
      analysis: response.text,
      model: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Error en /api/ai/diagnose:', error);
    res.status(500).json({
      error: error.message || 'Error al procesar el diagnóstico con IA.',
    });
  }
});

// 2. Executive Operational & Efficiency Summary
app.post('/api/ai/operational-summary', async (req, res) => {
  try {
    const { stats, movementsSummary, period } = req.body;

    const ai = getGenAI();
    const prompt = `Genera un informe ejecutivo y análisis operacional de movimientos de grúa portuaria.
Periodo: ${period || 'Últimas 24h / Turno actual'}
Datos operacionales:
${JSON.stringify(stats || movementsSummary, null, 2)}

Por favor incluye:
- Resumen de rendimiento (movimientos totales vs meta de eficiencia de 12 mov/h).
- Grúas y patios con mayor y menor rendimiento.
- Detección de posibles cuellos de botella u oportunidades de optimización.
- Conclusiones y recomendaciones operacionales directas.

Responde en español con formato Markdown limpio y profesional.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Eres un Consultor Senior en Logística y Operaciones Portuarias de Terminales de Contenedores.',
        temperature: 0.3,
      },
    });

    res.json({
      success: true,
      summary: response.text,
      model: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Error en /api/ai/operational-summary:', error);
    res.status(500).json({
      error: error.message || 'Error al generar el resumen operacional con IA.',
    });
  }
});

// 3. Operational Chat Assistant
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const ai = getGenAI();
    const prompt = `Contexto del sistema: ${context ? JSON.stringify(context) : 'Sistema de control de movimientos de grúa portuaria'}
Pregunta del usuario: ${message}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Eres el Asistente de Inteligencia Artificial para el sistema TG Movimientos de Grúa. Ayudas a operadores, mecánicos y administradores a optimizar su trabajo, resolver dudas técnicas y analizar datos de productividad.',
      },
    });

    res.json({
      success: true,
      reply: response.text,
      model: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Error en /api/ai/chat:', error);
    res.status(500).json({
      error: error.message || 'Error en el asistente de IA.',
    });
  }
});

// ----------------------------------------------------
// Health Check Endpoint
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiModel: 'gemini-3.8-flash',
    framework: '@google/genai',
    version: '2.22.0',
  });
});

// ----------------------------------------------------
// Vite Server / Static Handling
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

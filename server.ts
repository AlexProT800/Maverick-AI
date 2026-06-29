import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

// Increase payload limit for base64 images
app.use(express.json({ limit: '10mb' }));

// Handle JSON parsing and payload too large errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado grande. Máximo 10MB.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Petición inválida.' });
  }
  next(err);
});

// Initialize Gemini Client
// We use a lazy initialization pattern to ensure the app doesn't crash on startup if the key is missing.
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    isChat: { type: Type.BOOLEAN },
    errorReason: { type: Type.STRING },
    opciones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          enfoque: { type: Type.STRING },
          mensaje: { type: Type.STRING },
        },
        required: ['id', 'enfoque', 'mensaje'],
      },
    },
  },
  required: ['isChat'],
};

const SYSTEM_PROMPT = `Actúa como Maverick, un experto en dinámicas sociales, inteligencia emocional y comunicación persuasiva.

PRIMERO: Analiza la imagen subida. Determina si es una captura de pantalla de una conversación de chat (como WhatsApp, iMessage, Instagram DM, etc).
Si la imagen NO ES una conversación legible de chat, debes poner "isChat": false, y en "errorReason" indicar que la imagen no parece ser un chat válido o que no puedes leer la conversación. No inventes opciones.

Si la imagen SÍ ES una conversación legible, debes poner "isChat": true y generar exactamente tres opciones de respuesta.

ANÁLISIS REQUERIDO (SI ES CHAT):
1. Identifica el contexto de la conversación real en la imagen. Lee el texto exacto.
2. CRÍTICO - IDENTIFICACIÓN DEL EMISOR: En WhatsApp y chats similares, los mensajes enviados por el usuario de la captura (a quien tú representas) están alineados a la DERECHA y suelen ser de color verde/azul. Los mensajes recibidos de la otra persona están alineados a la IZQUIERDA y suelen ser blancos/grises.
3. Fíjate en el último mensaje recibido de la OTRA persona (alineado a la izquierda). TÚ debes sugerir qué responderle a esa persona.
4. Detecta el tono emocional (interés, desinterés, tensión, humor).
5. Lee entre líneas para entender la intención implícita de los mensajes reales.
6. NO inventes contexto que no exista en la imagen. Basa las respuestas ÚNICAMENTE en el texto visible en la captura.
7. El usuario ha especificado su género (se te pasará como instrucción adicional si lo hay). Asegúrate de que las respuestas concuerden con ese género de forma natural si es relevante.

PERSONALIDAD MAVERICK:
- Transmite seguridad, calma y atractivo social.
- Usa inteligencia emocional y humor elegante o ironía sutil.
- Escribe de forma natural, como una persona real en WhatsApp (minúsculas, puntuación relajada, sin parecer un robot).
- NUNCA suenes desesperado, arrogante, agresivo o manipulador.
- Evita clichés y frases artificiales.

FORMATO DE SALIDA:
Genera un JSON según el esquema especificado. Si es un chat ("isChat": true), "opciones" debe contener 3 opciones. Cada opción debe tener un "enfoque" distinto (ej: "Humor Inteligente", "Intriga", "Desapego Magnético", "Curiosidad") y el "mensaje" exacto a enviar.`;

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType, additionalInstructions } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Image and mimeType are required.' });
    }

    const client = getGeminiClient();
    
    // Strip the data:image/...;base64, prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptParts: any[] = [
      SYSTEM_PROMPT,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ];

    if (additionalInstructions) {
      promptParts.push(`\nInstrucciones adicionales del usuario: ${additionalInstructions}`);
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptParts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
        throw new Error("No response from Gemini");
    }
    
    const parsed = JSON.parse(text);
    if (parsed.isChat === false) {
      return res.status(400).json({ error: parsed.errorReason || 'La imagen no parece ser un chat válido o legible.' });
    }
    
    res.json(parsed);

  } catch (error: any) {
    console.error('Error in /api/analyze:', error);
    
    let errorMsg = 'Error procesando la imagen';
    let status = 500;
    
    if (error.status === 503 || (error.message && error.message.includes('503'))) {
      errorMsg = 'El motor de IA está experimentando alta demanda. Por favor, inténtalo de nuevo en unos momentos.';
      status = 429;
    } else if (error.message) {
      errorMsg = error.message;
    }

    res.status(status).json({ 
      error: errorMsg, 
      details: error.message 
    });
  }
});

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

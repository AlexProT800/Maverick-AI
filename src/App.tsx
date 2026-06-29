import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, UploadCloud, Copy, Check, Info, AlertTriangle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Background Effect Component
function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vsSource = `
      attribute vec4 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
          gl_Position = a_position;
          v_texCoord = a_texCoord;
      }
    `;
    
    const fsSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;

      void main() {
          vec2 uv = v_texCoord;
          float time = u_time * 0.2;
          
          float noise = sin(uv.x * 3.0 + time) * 0.5 + 0.5;
          noise += sin(uv.y * 2.5 - time * 1.2) * 0.3;
          noise += sin((uv.x + uv.y) * 4.0 + time * 0.8) * 0.2;
          
          noise = noise * 0.5 + 0.5;
          
          vec3 color1 = vec3(0.0, 0.48, 1.0); // Apple Blue
          vec3 color2 = vec3(0.05, 0.05, 0.07); // Deep black
          
          vec3 finalColor = mix(color2, color1, noise * 0.15);
          
          gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1.0,  1.0,
       1.0,  1.0,
      -1.0, -1.0,
       1.0, -1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    const texCoords = [
      0.0,  0.0,
      1.0,  0.0,
      0.0,  1.0,
      1.0,  1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "u_time");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");

    let animationFrameId: number;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl?.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    function render(time: number) {
      if (!gl || !program) return;
      time *= 0.001; 
      gl.uniform1f(timeLocation, time);
      if (canvas) {
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    }
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none opacity-60" 
      id="ambient-bg"
    />
  );
}

// Types
type MaverickOption = {
  id: number;
  enfoque: string;
  mensaje: string;
};

type AppState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [options, setOptions] = useState<MaverickOption[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [gender, setGender] = useState<'Hombre' | 'Mujer' | 'No Binario' | ''>('');
  const [toneStyle, setToneStyle] = useState<'Directo' | 'Equilibrado' | 'Magnético' | 'Personalizado'>('Equilibrado');
  const [customTone, setCustomTone] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setErrorMsg('Por favor, sube una imagen válida (PNG, JPG, JPEG).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      setErrorMsg('La imagen es demasiado grande. Máximo 10MB.');
      return;
    }

    setImageFile(file);
    setErrorMsg(null);
    setAppState('uploading');

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const copyToClipboard = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const analyzeImage = async () => {
    if (!imagePreview || !imageFile) return;

    setAppState('processing');
    setErrorMsg(null);

    try {
      const toneInstruction = toneStyle === 'Personalizado' && customTone.trim() ? customTone : toneStyle;
      const payloadInstructions = `${gender ? `El usuario es ${gender}. ` : ''}${toneStyle ? `El tono de las respuestas debe ser: ${toneInstruction}. ` : ''}${additionalInstructions}`;
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: imageFile.type,
          additionalInstructions: payloadInstructions
        }),
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Servidor no disponible. Por favor, inténtalo de nuevo.');
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('Respuesta inválida del servidor.');
      }

      if (!response.ok) {
        throw new Error((data && data.error) ? data.error : 'Error al analizar la imagen.');
      }

      if (data && data.opciones && Array.isArray(data.opciones)) {
        setOptions(data.opciones);
        setAppState('success');
      } else {
        throw new Error('Formato de respuesta inválido.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión. Inténtalo de nuevo.');
      setAppState('error');
    }
  };

  const resetState = () => {
    setAppState('idle');
    setImageFile(null);
    setImagePreview(null);
    setOptions([]);
    setErrorMsg(null);
  };

  return (
    <div className="text-on-surface antialiased min-h-screen flex flex-col relative z-0 selection:bg-apple-blue/30 selection:text-white">
      <AmbientBackground />
      
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 glass-panel border-b border-white/10 flex justify-between items-center px-6 py-4">
        <div 
          className="flex items-center gap-3 hover:bg-white/10 transition-colors rounded-full px-2 py-1 cursor-pointer group active:scale-95 duration-200"
          onClick={resetState}
        >
          <Sparkles className="text-primary group-hover:scale-110 transition-transform w-6 h-6" />
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-bold tracking-tight text-on-surface">Maverick AI</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-xs text-on-surface-variant uppercase tracking-wider font-mono-label">AI Online</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-full overflow-hidden border border-white/10 hover:border-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-apple-blue focus:ring-offset-2 focus:ring-offset-black"
        >
          <div className="w-full h-full bg-surface-bright flex items-center justify-center">
            <User className="w-5 h-5 text-on-surface-variant" />
          </div>
        </button>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-overlay w-full max-w-sm rounded-3xl p-6 relative z-10 border border-white/10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-on-surface">Perfil & Ajustes</h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-on-surface-variant hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-2">Tu Género</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Hombre', 'Mujer', 'No Binario'].map((g) => (
                      <button
                        key={g}
                        onClick={() => setGender(g as any)}
                        className={cn(
                          "py-2 text-sm rounded-xl border transition-all font-medium",
                          gender === g 
                            ? "bg-apple-blue border-apple-blue text-white shadow-[0_0_15px_rgba(0,122,255,0.3)]" 
                            : "bg-white/5 border-white/5 text-on-surface-variant hover:bg-white/10"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-on-surface-variant/60 mt-3">
                    Ayuda a Maverick a adaptar el tono y la forma de responder según tu identidad.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-on-surface-variant mb-2">Estilo de Tono</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Directo', 'Equilibrado', 'Magnético', 'Personalizado'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setToneStyle(t as any)}
                        className={cn(
                          "py-2 text-sm rounded-xl border transition-all font-medium",
                          toneStyle === t 
                            ? "bg-apple-blue border-apple-blue text-white shadow-[0_0_15px_rgba(0,122,255,0.3)]" 
                            : "bg-white/5 border-white/5 text-on-surface-variant hover:bg-white/10"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {toneStyle === 'Personalizado' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <input
                          type="text"
                          value={customTone}
                          onChange={(e) => setCustomTone(e.target.value)}
                          placeholder="Ej: sarcástico, muy breve, poético..."
                          className="mt-3 w-full bg-white/5 border border-white/10 text-on-surface text-sm rounded-xl py-2.5 px-4 focus:outline-none focus:border-apple-blue focus:ring-1 focus:ring-apple-blue/50 transition-all placeholder-on-surface-variant/50"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-medium transition-colors"
              >
                Guardar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-grow pt-[100px] pb-32 px-6 md:px-0 max-w-3xl mx-auto w-full flex flex-col gap-8">
        
        {/* Error Banner */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-panel border-red-500/30 bg-red-500/10 text-red-200 p-4 rounded-xl flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-sm">{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload State */}
        {(appState === 'idle' || appState === 'error') && !imagePreview && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] cursor-pointer group hover:bg-white/[0.02] transition-colors border-dashed border-2 border-white/10 hover:border-apple-blue/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/png, image/jpeg, image/jpg"
              onChange={handleFileSelect}
            />
            <div className="w-16 h-16 rounded-full glass-action flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ease-out">
              <UploadCloud className="w-8 h-8 text-apple-blue" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl md:text-3xl text-on-surface mb-2 font-semibold">Sube tu captura de WhatsApp</h1>
            <p className="text-sm text-on-surface-variant mb-6">Arrastra la imagen o pulsa para seleccionarla</p>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant/60 px-4 py-2 rounded-full bg-white/5 font-mono-label">
               PNG • JPG • JPEG • Análisis multimodal
            </div>
          </motion.div>
        )}

        {/* Preview State */}
        {(appState === 'uploading' || (appState === 'error' && imagePreview)) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-6 flex flex-col items-center"
          >
            <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-white/10 mb-6">
              <img src={imagePreview!} alt="Preview" className="w-full h-auto object-cover" />
              <button 
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/80 backdrop-blur-md p-2 rounded-full text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); resetState(); }}
              >
                ✕
              </button>
            </div>
            <button 
              onClick={analyzeImage}
              className="w-full max-w-sm bg-apple-blue text-white py-3 rounded-xl font-medium hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,122,255,0.3)]"
            >
              Analizar Conversación
            </button>
          </motion.div>
        )}

        {/* Processing State */}
        {appState === 'processing' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px]"
          >
            <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-apple-blue animate-spin mb-6"></div>
            <div className="text-xl text-on-surface font-medium shimmer-sweep px-4">
              Analizando dinámicas sociales...
            </div>
            <p className="text-sm text-on-surface-variant mt-3 text-center max-w-sm">
              Extrayendo intención oculta, tono emocional y oportunidades tácticas de la conversación.
            </p>
          </motion.div>
        )}

        {/* Success / Results State */}
        {appState === 'success' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-6 relative z-10"
          >
            <div className="flex flex-col items-center justify-center py-4">
              <h2 className="text-xl text-on-surface font-semibold soft-pulse">Sugerencias Tácticas</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {options.map((option, index) => {
                const colors = [
                  'text-apple-blue border-apple-blue/20 bg-apple-blue/10',
                  'text-purple-400 border-purple-500/20 bg-purple-500/10',
                  'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                ];
                const colorClass = colors[index % colors.length];

                return (
                  <motion.div 
                    key={option.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.15 }}
                    className="glass-overlay rounded-3xl p-6 flex flex-col gap-4 relative z-10 backdrop-blur-xl bg-[#1e1e20]/80 group"
                  >
                    <div className="flex justify-between items-center">
                      <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono-label text-xs uppercase tracking-wider", colorClass)}>
                        <Info className="w-3.5 h-3.5" />
                        {option.enfoque}
                      </span>
                    </div>
                    <p className="text-lg text-on-surface leading-relaxed font-medium">
                      "{option.mensaje}"
                    </p>
                    <div className="flex justify-end mt-2">
                      <button 
                        onClick={() => copyToClipboard(option.id, option.mensaje)}
                        className={cn(
                          "px-5 py-2 rounded-full transition-all flex items-center gap-2 active:scale-95 text-sm font-medium",
                          copiedId === option.id 
                            ? "bg-apple-blue text-white" 
                            : "glass-action hover:bg-white/20 text-on-surface"
                        )}
                      >
                        {copiedId === option.id ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </main>

      {/* Floating Input Area (always present, but mainly used for context or re-prompting) */}
      <div className="fixed bottom-0 left-0 w-full p-6 flex justify-center z-40 bg-gradient-to-t from-black via-black/80 to-transparent pb-8 pointer-events-none">
        <div className="w-full max-w-2xl relative pointer-events-auto">
          <input 
            type="text"
            className="w-full bg-white/5 border border-white/10 text-on-surface text-sm md:text-base rounded-full py-4 pl-6 pr-14 focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/50 transition-all placeholder-on-surface-variant/50 backdrop-blur-md" 
            placeholder="Añade contexto extra (ej: 'Quiero sonar más distante')"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && appState === 'uploading') {
                analyzeImage();
              }
            }}
          />
          <button 
            onClick={analyzeImage}
            disabled={!imagePreview || appState === 'processing'}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-apple-blue rounded-full flex items-center justify-center text-white hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,122,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 ml-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

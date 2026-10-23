"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { INTERVALO_MINUTOS } from "@/lib/creditos";
import { construirOrdenReproduccion, CancionPendiente } from "@/lib/ordenCola";
import { Toaster, toast } from "sonner"; 

interface Mesa {
    numero: number;
    creditosDisponibles: number;
    ventanaInicio: number;
}

interface VideoYoutube {
    id: string;
    titulo: string;
    canal: string;
    miniatura: string;
}

export default function VistaMesa() {
    const params = useParams();
    const numeroMesa = params.numero as string;

    const [mesa, setMesa] = useState<Mesa | null>(null);
    const [cargando, setCargando] = useState(true);
    const [existe, setExiste] = useState(true);

    const [busqueda, setBusqueda] = useState("");
    const [resultados, setResultados] = useState<VideoYoutube[]>([]);
    const [buscando, setBuscando] = useState(false);

    const [agregandoId, setAgregandoId] = useState<string | null>(null);
    const [segundosRestantes, setSegundosRestantes] = useState(0);
    const [cola, setCola] = useState<CancionPendiente[]>([]);

    useEffect(() => {
        async function verificarMesa() {
            const ref = doc(db, "mesas", numeroMesa);
            const snapshot = await getDoc(ref);
            setExiste(snapshot.exists());
            setCargando(false);
        }
        verificarMesa();
    }, [numeroMesa]);

    useEffect(() => {
        if (!existe) return;
        async function revisarEstado() {
            await fetch(`/api/estado-mesa?numeroMesa=${numeroMesa}`);
        }
        revisarEstado();
        const intervalo = setInterval(revisarEstado, 15000);
        return () => clearInterval(intervalo);
    }, [numeroMesa, existe]);

    useEffect(() => {
        if (!existe) return;
        const ref = doc(db, "mesas", numeroMesa);
        const unsubscribe = onSnapshot(ref, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const ventanaInicio = data.ventanaInicio as Timestamp;
                setMesa({
                    numero: data.numero,
                    creditosDisponibles: data.creditosDisponibles,
                    ventanaInicio: ventanaInicio.toMillis(),
                });
            }
        });
        return () => unsubscribe();
    }, [numeroMesa, existe]);

    useEffect(() => {
        if (!existe) return;
        const q = query(collection(db, "colaCanciones"), where("estado", "==", "pendiente"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const canciones = snapshot.docs.map((doc) => {
                const data = doc.data();
                const creadaEn = data.creadaEn as Timestamp | null;
                return {
                    id: doc.id,
                    titulo: data.titulo,
                    genero: data.genero,
                    mesaId: data.mesaId,
                    creadaEn: creadaEn ? creadaEn.toMillis() : Date.now(),
                };
            }) as CancionPendiente[];
            const ordenadas = construirOrdenReproduccion(canciones);
            setCola(ordenadas);
        });
        return () => unsubscribe();
    }, [existe]);

    useEffect(() => {
        if (!mesa) return;
        function calcular() {
            const finVentana = mesa!.ventanaInicio + INTERVALO_MINUTOS * 60 * 1000;
            const restante = Math.max(0, Math.round((finVentana - Date.now()) / 1000));
            setSegundosRestantes(restante);
        }
        calcular();
        const intervalo = setInterval(calcular, 1000);
        return () => clearInterval(intervalo);
    }, [mesa]);

    async function buscarVideos() {
        if (!busqueda.trim()) return;
        setBuscando(true);
        setResultados([]);

        const res = await fetch(`/api/buscar-canciones?q=${encodeURIComponent(busqueda)}`);
        const data = await res.json();

        if (res.ok) {
            setResultados(data.videos);
            if (data.videos.length === 0) {
                toast.info("No encontramos canciones con ese nombre.");
            }
        } else {
            toast.error(data.error || "Error al buscar");
        }
        setBuscando(false);
    }

    async function agregarCancion(video: VideoYoutube) {
        setAgregandoId(video.id);
        const toastId = toast.loading("Analizando canción...");

        const res = await fetch("/api/agregar-cancion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ numeroMesa, videoId: video.id, titulo: video.titulo, canal: video.canal }),
        });

        const data = await res.json();

        if (res.ok) {
            toast.success(`Agregada como ${data.genero}`, { id: toastId });
            setBusqueda(""); 
            setResultados([]);
        } else {
            toast.error(data.error, { id: toastId, duration: 5000 });
        }
        setAgregandoId(null);
    }

    function formatearTiempo(segundos: number) {
        const min = Math.floor(segundos / 60);
        const seg = segundos % 60;
        return `${min}:${seg.toString().padStart(2, "0")}`;
    }

    if (cargando) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f11] font-sans">
                <div className="w-10 h-10 border-4 border-neutral-800 border-l-yellow-500 rounded-full animate-spin mb-4" />
                <p className="text-neutral-400 text-lg">Preparando tu mesa...</p>
            </div>
        );
    }

    if (!existe) {
        return (
            <div className="min-h-screen bg-[#0f0f11] text-white p-6 text-center flex flex-col justify-center">
                <h1 className="text-2xl font-bold mb-2">⚠️ Mesa no encontrada</h1>
                <p className="text-neutral-400">La mesa #{numeroMesa} no existe. Verifica el código QR.</p>
            </div>
        );
    }

    const sinCreditos = mesa !== null && mesa.creditosDisponibles <= 0;

    return (
        <div className="min-h-screen bg-[#0f0f11] text-white font-sans max-w-md mx-auto relative pb-24">
            <Toaster position="top-center" richColors theme="dark" />

            {/* HEADER FIJO (STICKY) CON EFECTO VIDRIO */}
            <div className="sticky top-0 z-50 bg-[#0f0f11]/60 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-white/5 shadow-md">
                <header className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {/* LOGO CENTRADO Y AJUSTADO */}
                        <div className="w-12 h-12 rounded-full border border-yellow-500/50 overflow-hidden shrink-0 flex items-center justify-center bg-[#0f0f11]">
                            <img 
                                src="/logo-la-oficina.jpg" 
                                alt="Logo La Oficina" 
                                className="w-full h-full object-contain object-center scale-110"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest leading-none mb-1">Rockola Exclusiva</p>
                            <p className="text-sm font-semibold flex items-center gap-2 leading-none">
                                La Oficina <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            </p>
                        </div>
                    </div>
                    <div className="bg-[#1a1a1c]/80 backdrop-blur-md border border-neutral-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shrink-0">
                        🎵 MESA #{mesa?.numero}
                    </div>
                </header>
            </div>

            {/* CONTENEDOR PRINCIPAL CON PADDING */}
            <div className="p-4 pt-6">
                {/* BIENVENIDA Y CRÉDITOS */}
                <div className="text-center mb-8">
                    <p className="text-yellow-500 text-sm italic font-medium mb-1 px-4">
                        ¡Bienvenidos! Disfruten de su música preferida aquí en <strong className="text-white">La Oficina</strong>.
                    </p>
                    <p className="text-[10px] text-neutral-500 mb-5 tracking-widest uppercase">Horas extras aseguradas</p>
                    
                    <div className="inline-flex items-center gap-3 bg-[#1a1a1c] border border-yellow-500/30 rounded-full px-5 py-2">
                        <span className="text-yellow-500 text-sm">ℹ️</span>
                        <span className="text-sm text-neutral-300">Créditos disponibles:</span>
                        <span className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold ${sinCreditos ? 'bg-red-500' : 'bg-emerald-600'}`}>
                            {mesa?.creditosDisponibles}
                        </span>
                    </div>
                </div>

                {/* BUSCADOR O ESTADO DE SIN CRÉDITOS */}
                {sinCreditos ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-center mb-8">
                        <p className="text-red-400 font-bold mb-2">😕 Ups, se te acabaron los créditos.</p>
                        <p className="text-sm text-red-200/70">
                            Debes esperar <strong className="text-red-400">{formatearTiempo(segundosRestantes)}</strong> para pedir más.
                        </p>
                    </div>
                ) : (
                    <div className="mb-8">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && buscarVideos()}
                                    placeholder="Busca tu canción..."
                                    className="w-full bg-[#1a1a1c] border border-neutral-800 text-white rounded-xl pl-4 pr-4 py-3.5 text-sm focus:outline-none focus:border-yellow-500/50 transition-colors"
                                />
                            </div>
                            <button 
                                onClick={buscarVideos} 
                                disabled={buscando}
                                className="bg-yellow-500 text-black font-bold px-6 py-3.5 rounded-xl text-sm hover:bg-yellow-400 transition-colors"
                            >
                                {buscando ? "..." : "BUSCAR"}
                            </button>
                        </div>

                        {/* RESULTADOS DE BÚSQUEDA */}
                        {resultados.length > 0 && (
                            <div className="mt-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h2 className="text-xs font-bold tracking-widest text-neutral-400 uppercase">Resultados</h2>
                                    <button onClick={() => setResultados([])} className="text-xs text-yellow-500">Cerrar</button>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {resultados.map((video) => (
                                        <div key={video.id} className="flex gap-3 bg-[#1a1a1c] border border-neutral-800 p-2 rounded-xl items-center">
                                            <img src={video.miniatura} alt={video.titulo} className="w-20 h-14 object-cover rounded-lg" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white truncate">{video.titulo}</p>
                                                <p className="text-xs text-neutral-400 truncate">{video.canal}</p>
                                            </div>
                                            <button
                                                onClick={() => agregarCancion(video)}
                                                disabled={agregandoId === video.id}
                                                className="bg-neutral-800 text-yellow-500 border border-neutral-700 text-xs font-bold px-3 py-2 rounded-lg shrink-0 hover:bg-neutral-700"
                                            >
                                                {agregandoId === video.id ? '⏳' : 'Agregar'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* COLA DE REPRODUCCIÓN */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-bold text-sm tracking-widest flex items-center gap-2">
                            🎵 PRÓXIMAS EN SONAR
                        </h2>
                        {cola.length > 0 && (
                            <span className="text-xs text-yellow-500 border border-yellow-500/30 rounded-full px-2 py-0.5">
                                {cola.length} en fila
                            </span>
                        )}
                    </div>

                    {cola.length === 0 ? (
                        <div className="text-center py-10 bg-[#1a1a1c] rounded-2xl border border-neutral-800">
                            <p className="text-neutral-500 text-sm">No hay canciones en la cola.<br/>¡Sé el primero en pedir una!</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {cola.slice(0, 10).map((c, index) => {
                                const isFirst = index === 0;
                                return (
                                    <div 
                                        key={c.id} 
                                        className={`p-4 rounded-2xl flex items-center gap-4 transition-all ${
                                            isFirst 
                                                ? 'border border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 to-transparent' 
                                                : 'border border-neutral-800 bg-[#1a1a1c]'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm shrink-0 ${
                                            isFirst ? 'bg-yellow-500/20 text-yellow-500' : 'bg-neutral-900 text-neutral-500'
                                        }`}>
                                            {isFirst ? '▶' : String(index + 1).padStart(2, '0')}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`text-sm font-bold truncate ${isFirst ? 'text-yellow-500' : 'text-neutral-200'}`}>
                                                {c.titulo}
                                            </h3>
                                            <p className="text-xs text-neutral-400 truncate mt-0.5">
                                                {c.genero} • Pedida por Mesa {c.mesaId}
                                            </p>
                                        </div>
                                        {isFirst && (
                                            <span className="text-[10px] bg-yellow-500 text-black px-2 py-1 rounded font-bold shrink-0">
                                                #1 Siguiente
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
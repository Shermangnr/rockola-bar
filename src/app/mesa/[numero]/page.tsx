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
                toast.info("No encontramos canciones con ese nombre."); // Aviso sutil si no hay resultados
            }
        } else {
            toast.error(data.error || "Error al buscar"); // Error rojo
        }

        setBuscando(false);
    }

    async function agregarCancion(video: VideoYoutube) {
        setAgregandoId(video.id);
        
        // 2. Mostramos un mensaje de carga flotante mientras Gemini procesa
        const toastId = toast.loading("Analizando canción...");

        const res = await fetch("/api/agregar-cancion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                numeroMesa,
                videoId: video.id,
                titulo: video.titulo,
                canal: video.canal,
            }),
        });

        const data = await res.json();

        // 3. Actualizamos la notificación flotante según el resultado
        if (res.ok) {
            toast.success(`Agregada como ${data.genero}`, { id: toastId });
        } else {
            toast.error(data.error, { id: toastId, duration: 5000 }); // Dejamos el error 5 segundos para que puedan leerlo
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", fontFamily: "sans-serif" }}>
                {/* Un spinner sencillo hecho con CSS */}
                <div style={{
                    border: "4px solid rgba(0, 0, 0, 0.1)",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    borderLeftColor: "#000",
                    animation: "spin 1s linear infinite",
                    marginBottom: "15px"
                }} />
                {/* Inyectamos los keyframes para la animación del spinner */}
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
                <p style={{ fontSize: "18px", color: "#666" }}>Preparando tu mesa...</p>
            </div>
        );
    }

    if (!existe) {
        return (
            <div style={{ padding: 20 }}>
                <h1>⚠️ Mesa no encontrada</h1>
                <p>La mesa #{numeroMesa} no existe. Verifica el código QR.</p>
            </div>
        );
    }

    const sinCreditos = mesa !== null && mesa.creditosDisponibles <= 0;

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 700 }}>
            {/* 4. Montamos el Toaster en la parte superior para que sea visible en celulares */}
            <Toaster position="top-center" richColors />

            <div style={{ marginBottom: 25, textAlign: "center" }}>
                <h1 style={{ margin: "0 0 10px 0", color: "#333" }}>🎵 Mesa #{mesa?.numero}</h1>
                <p style={{ margin: "0 0 15px 0", color: "#555", fontSize: "16px", fontStyle: "italic" }}>
                    ¡Bienvenidos! Disfruten de su música preferida aquí en <strong>La Oficina</strong>.
                </p>
                <div style={{ display: "inline-block", backgroundColor: "#f0f0f0", padding: "8px 16px", borderRadius: "20px" }}>
                    <span style={{ fontSize: "15px" }}>
                        Créditos disponibles: <strong style={{ color: mesa?.creditosDisponibles === 0 ? "#ff4d4f" : "#389e0d", fontSize: "18px" }}>{mesa?.creditosDisponibles}</strong>
                    </span>
                </div>
            </div>

            {sinCreditos ? (
                <div
                    style={{
                        marginTop: 20,
                        padding: 16,
                        background: "#fff3cd",
                        border: "1px solid #ffecb5",
                        borderRadius: 8,
                    }}
                >
                    <p style={{ fontWeight: "bold", margin: 0 }}>
                        😕 Ups, se te acabaron los créditos.
                    </p>
                    <p style={{ margin: "8px 0 0" }}>
                        Debes esperar <strong>{formatearTiempo(segundosRestantes)}</strong> para poder
                        pedir más música.
                    </p>
                </div>
            ) : (
                <>
                    <div style={{ marginTop: 20 }}>
                        <input
                            type="text"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && buscarVideos()}
                            placeholder="Busca tu canción..."
                            style={{ padding: 8, width: "70%", marginRight: 10 }}
                        />
                        <button onClick={buscarVideos} style={{ padding: "8px 16px" }}>
                            Buscar
                        </button>
                    </div>

                    {buscando && <p style={{ marginTop: 10, color: "#666" }}>Buscando en YouTube...</p>}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
                        {resultados.map((video) => (
                            <div key={video.id} style={{ width: 200 }}>
                                <img src={video.miniatura} alt={video.titulo} width="100%" style={{ borderRadius: 8 }} />
                                <p style={{ fontSize: 14, fontWeight: "bold", margin: "8px 0 4px" }}>{video.titulo}</p>
                                <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>{video.canal}</p>
                                <button
                                    onClick={() => agregarCancion(video)}
                                    disabled={agregandoId === video.id}
                                    style={{ 
                                        padding: "6px 12px", 
                                        width: "100%", 
                                        cursor: agregandoId === video.id ? "not-allowed" : "pointer" 
                                    }}
                                >
                                    {agregandoId === video.id ? "Analizando..." : "+ Agregar a la cola"}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div style={{ marginTop: 40, borderTop: "1px solid #eee", paddingTop: 20 }}>
                <h2>🎶 Próximas en sonar</h2>
                {cola.length === 0 ? (
                    <p style={{ color: "#666" }}>No hay canciones en la cola. ¡Sé el primero en pedir una!</p>
                ) : (
                    <ol style={{ paddingLeft: 20, margin: 0 }}>
                        {cola.slice(0, 10).map((c) => (
                            <li key={c.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f5f5f5" }}>
                                <strong>{c.titulo}</strong>
                                <div style={{ fontSize: "0.85em", color: "#666", marginTop: 4 }}>
                                    {c.genero} • Pedida por Mesa {c.mesaId}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
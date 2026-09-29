"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Mesa {
    numero: number;
    creditosDisponibles: number;
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
    const [mensaje, setMensaje] = useState<string | null>(null);

    // Verifica si la mesa existe (una sola vez al entrar)
    useEffect(() => {
        async function verificarMesa() {
            const ref = doc(db, "mesas", numeroMesa);
            const snapshot = await getDoc(ref);
            setExiste(snapshot.exists());
            setCargando(false);
        }
        verificarMesa();
    }, [numeroMesa]);

    // Escucha los créditos EN VIVO, para que se actualicen solos tras cada canción agregada
    useEffect(() => {
        if (!existe) return;
        const ref = doc(db, "mesas", numeroMesa);
        const unsubscribe = onSnapshot(ref, (snapshot) => {
            if (snapshot.exists()) {
                setMesa(snapshot.data() as Mesa);
            }
        });
        return () => unsubscribe();
    }, [numeroMesa, existe]);

    async function buscarVideos() {
        if (!busqueda.trim()) return;
        setBuscando(true);
        setResultados([]);
        setMensaje(null);

        const res = await fetch(`/api/buscar-canciones?q=${encodeURIComponent(busqueda)}`);
        const data = await res.json();

        if (res.ok) {
            setResultados(data.videos);
        } else {
            setMensaje(`⚠️ ${data.error || "Error al buscar"}`);
        }

        setBuscando(false);
    }

    async function agregarCancion(video: VideoYoutube) {
        setAgregandoId(video.id);
        setMensaje(null);

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

        if (res.ok) {
            setMensaje(`✅ Agregada como ${data.genero}`);
        } else {
            setMensaje(`⚠️ ${data.error}`);
        }

        setAgregandoId(null);
    }

    if (cargando) return <p style={{ padding: 20 }}>Cargando...</p>;

    if (!existe) {
        return (
            <div style={{ padding: 20 }}>
                <h1>⚠️ Mesa no encontrada</h1>
                <p>La mesa #{numeroMesa} no existe. Verifica el código QR.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 700 }}>
            <h1>🎵 Mesa #{mesa?.numero}</h1>
            <p style={{ fontSize: 18 }}>
                Créditos disponibles: <strong>{mesa?.creditosDisponibles}</strong>
            </p>

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

            {buscando && <p>Buscando...</p>}
            {mensaje && <p style={{ marginTop: 10, fontWeight: "bold" }}>{mensaje}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
                {resultados.map((video) => (
                    <div key={video.id} style={{ width: 200 }}>
                        <img src={video.miniatura} alt={video.titulo} width="100%" />
                        <p style={{ fontSize: 14, fontWeight: "bold" }}>{video.titulo}</p>
                        <p style={{ fontSize: 12, color: "#666" }}>{video.canal}</p>
                        <button
                            onClick={() => agregarCancion(video)}
                            disabled={agregandoId === video.id}
                            style={{ padding: "6px 12px", width: "100%" }}
                        >
                            {agregandoId === video.id ? "Agregando..." : "+ Agregar a la cola"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
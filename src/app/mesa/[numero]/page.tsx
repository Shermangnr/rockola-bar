"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
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

const GENEROS = [
  "Salsa",
  "Merengue",
  "Vallenato",
  "Reguetón",
  "Bachata",
  "Champeta",
  "Popular / Despecho",
  "Banda",
  "Balada Romántica",
  "Crossover / Mix",
];

export default function VistaMesa() {
  const params = useParams();
  const numeroMesa = params.numero as string;

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [existe, setExiste] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<VideoYoutube[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [videoParaAgregar, setVideoParaAgregar] = useState<VideoYoutube | null>(null);
  const [generoSeleccionado, setGeneroSeleccionado] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    cargarMesa();
  }, [numeroMesa]);

  async function cargarMesa() {
    setCargando(true);
    const ref = doc(db, "mesas", numeroMesa);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
      setMesa(snapshot.data() as Mesa);
      setExiste(true);
    } else {
      setExiste(false);
    }
    setCargando(false);
  }

  async function buscarVideos() {
    if (!busqueda.trim()) return;
    setBuscando(true);
    setResultados([]);

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(
      busqueda
    )}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    const videos: VideoYoutube[] = data.items.map((item: any) => ({
      id: item.id.videoId,
      titulo: item.snippet.title,
      canal: item.snippet.channelTitle,
      miniatura: item.snippet.thumbnails.medium.url,
    }));

    setResultados(videos);
    setBuscando(false);
  }

  function abrirSeleccionGenero(video: VideoYoutube) {
    setVideoParaAgregar(video);
    setGeneroSeleccionado("");
    setMensaje(null);
  }

  async function confirmarAgregarCancion() {
    if (!videoParaAgregar || !generoSeleccionado) return;
    setAgregando(true);
    setMensaje(null);

    const mesaRef = doc(db, "mesas", numeroMesa);
    const colaRef = collection(db, "colaCanciones");

    try {
      await runTransaction(db, async (transaction) => {
        const mesaSnap = await transaction.get(mesaRef);

        if (!mesaSnap.exists()) {
          throw new Error("La mesa ya no existe.");
        }

        const creditos = mesaSnap.data().creditosDisponibles as number;

        if (creditos <= 0) {
          throw new Error("No te quedan créditos disponibles esta hora.");
        }

        transaction.update(mesaRef, { creditosDisponibles: creditos - 1 });

        const nuevaCancionRef = doc(colaRef);
        transaction.set(nuevaCancionRef, {
          titulo: videoParaAgregar.titulo,
          artista: videoParaAgregar.canal,
          genero: generoSeleccionado,
          youtubeVideoId: videoParaAgregar.id,
          mesaId: numeroMesa,
          estado: "pendiente",
          creadaEn: serverTimestamp(),
        });
      });

      setMensaje("✅ ¡Canción agregada a la cola!");
      setVideoParaAgregar(null);
      cargarMesa();
    } catch (error: any) {
      setMensaje(`⚠️ ${error.message || "Ocurrió un error al agregar la canción."}`);
    }

    setAgregando(false);
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
          placeholder="Busca tu canción..."
          style={{ padding: 8, width: "70%", marginRight: 10 }}
        />
        <button onClick={buscarVideos} style={{ padding: "8px 16px" }}>
          Buscar
        </button>
      </div>

      {buscando && <p>Buscando...</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
        {resultados.map((video) => (
          <div key={video.id} style={{ width: 200 }}>
            <img src={video.miniatura} alt={video.titulo} width="100%" />
            <p style={{ fontSize: 14, fontWeight: "bold" }}>{video.titulo}</p>
            <p style={{ fontSize: 12, color: "#666" }}>{video.canal}</p>
            <button
              onClick={() => abrirSeleccionGenero(video)}
              style={{ padding: "6px 12px", width: "100%" }}
            >
              + Agregar a la cola
            </button>
          </div>
        ))}
      </div>

      {videoParaAgregar && (
        <div style={{ marginTop: 20, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
          <p>
            Vas a agregar: <strong>{videoParaAgregar.titulo}</strong>
          </p>
          <label>
            Selecciona el género:
            <select
              value={generoSeleccionado}
              onChange={(e) => setGeneroSeleccionado(e.target.value)}
              style={{ marginLeft: 10, padding: 6 }}
            >
              <option value="">-- Elige un género --</option>
              {GENEROS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={confirmarAgregarCancion}
              disabled={!generoSeleccionado || agregando}
              style={{ padding: "8px 16px", marginRight: 10 }}
            >
              {agregando ? "Agregando..." : "Confirmar"}
            </button>
            <button onClick={() => setVideoParaAgregar(null)} style={{ padding: "8px 16px" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mensaje && <p style={{ marginTop: 20, fontWeight: "bold" }}>{mensaje}</p>}
    </div>
  );
}
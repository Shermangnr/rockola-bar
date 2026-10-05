"use client";

import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { construirOrdenReproduccion, CancionPendiente } from "@/lib/ordenCola";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface CancionFirestore extends CancionPendiente {
  youtubeVideoId: string;
  artista: string;
}

export default function VistaPantalla() {
  const [pendientes, setPendientes] = useState<CancionFirestore[]>([]);
  const [videoActual, setVideoActual] = useState<CancionFirestore | null>(null);
  const [iniciado, setIniciado] = useState(false);

  const playerRef = useRef<any>(null);
  const apiListaRef = useRef(false);
  const videoActualRef = useRef<CancionFirestore | null>(null);
  const idsFinalizadosRef = useRef<Set<string>>(new Set()); // "ya terminadas", aunque Firestore no haya avisado todavía

  function actualizarVideoActual(valor: CancionFirestore | null) {
    videoActualRef.current = valor;
    setVideoActual(valor);
  }

  useEffect(() => {
    const q = query(collection(db, "colaCanciones"), where("estado", "==", "pendiente"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const canciones: CancionFirestore[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const creadaEn = data.creadaEn as Timestamp | null;
        return {
          id: doc.id,
          titulo: data.titulo,
          artista: data.artista,
          genero: data.genero,
          youtubeVideoId: data.youtubeVideoId,
          creadaEn: creadaEn ? creadaEn.toMillis() : Date.now(),
        };
      });

      // Una vez Firestore confirma el cambio, ya no hace falta recordarla como "recién terminada"
      for (const id of idsFinalizadosRef.current) {
        if (!canciones.some((c) => c.id === id)) {
          idsFinalizadosRef.current.delete(id);
        }
      }

      setPendientes(canciones);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (apiListaRef.current) return;
    apiListaRef.current = true;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player("reproductor-youtube", {
        height: "100%",
        width: "100%",
        events: {
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              marcarComoReproducida();
            }
          },
        },
      });
    };
  }, []);

  useEffect(() => {
    if (!iniciado) return;
    if (videoActual) return;
    if (!playerRef.current || !playerRef.current.loadVideoById) return;

    // Excluye las que ya sabemos que terminaron, aunque Firestore no haya avisado todavía
    const disponibles = pendientes.filter((c) => !idsFinalizadosRef.current.has(c.id));
    if (disponibles.length === 0) return;

    const orden = construirOrdenReproduccion(disponibles);
    const siguiente = orden[0] as CancionFirestore | undefined;
    if (!siguiente) return;

    actualizarVideoActual(siguiente);
    playerRef.current.loadVideoById(siguiente.youtubeVideoId);
  }, [pendientes, videoActual, iniciado]);

  async function marcarComoReproducida() {
    const actual = videoActualRef.current;
    if (!actual) return;
    if (idsFinalizadosRef.current.has(actual.id)) return; // evita marcar la misma dos veces

    idsFinalizadosRef.current.add(actual.id);
    actualizarVideoActual(null);

    await fetch("/api/marcar-reproducida", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancionId: actual.id }),
    });
  }

  function iniciarPantalla() {
    setIniciado(true);
  }

  const pendientesVisibles = pendientes.filter((c) => !idsFinalizadosRef.current.has(c.id));

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", position: "relative" }}>
      {!iniciado && (
        <button
          onClick={iniciarPantalla}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            fontSize: 28,
            border: "none",
            cursor: "pointer",
          }}
        >
          ▶️ Toca para iniciar la pantalla del bar
        </button>
      )}

      <div style={{ width: "100%", aspectRatio: "16 / 9" }}>
        <div id="reproductor-youtube" />
      </div>

      <div style={{ padding: 20 }}>
        {videoActual ? (
          <>
            <h2>🎶 Sonando ahora:</h2>
            <p>
              {videoActual.titulo} — {videoActual.artista} ({videoActual.genero})
            </p>
          </>
        ) : (
          <p>Esperando canciones en la cola...</p>
        )}

        {(() => {
          const proximas = construirOrdenReproduccion(pendientesVisibles)
            .filter((c) => c.id !== videoActual?.id)
            .slice(0, 5);

          return (
            <>
              <h3 style={{ marginTop: 20 }}>Próximas en la cola ({proximas.length}):</h3>
              <ol>
                {proximas.map((c) => (
                  <li key={c.id}>
                    {c.titulo} ({c.genero})
                  </li>
                ))}
              </ol>
            </>
          );
        })()}
      </div>
    </div>
  );
}
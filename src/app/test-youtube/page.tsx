"use client";

import { useState } from "react";

interface VideoYoutube {
  id: string;
  titulo: string;
  canal: string;
  miniatura: string;
}

export default function TestYoutube() {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<VideoYoutube[]>([]);
  const [cargando, setCargando] = useState(false);
  const [videoSeleccionado, setVideoSeleccionado] = useState<string | null>(
    null,
  );

  async function buscarVideos() {
    if (!busqueda.trim()) return;
    setCargando(true);

    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(
      busqueda,
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
    setCargando(false);
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>🔍 Prueba de búsqueda y reproducción — YouTube</h1>
      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar una canción..."
        style={{ padding: 8, width: 300, marginRight: 10 }}
      />
      <button onClick={buscarVideos} style={{ padding: "8px 16px" }}>
        Buscar
      </button>

      {videoSeleccionado && (
        <div style={{ marginTop: 20 }}>
          <h3>Reproduciendo ahora:</h3>
          <iframe
            width="560"
            height="315"
            src={`https://www.youtube.com/embed/${videoSeleccionado}?autoplay=1`}
            title="Reproductor"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      )}

      {cargando && <p>Buscando...</p>}

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}
      >
        {resultados.map((video) => (
          <div
            key={video.id}
            style={{ width: 200, cursor: "pointer" }}
            onClick={() => setVideoSeleccionado(video.id)}
          >
            <img src={video.miniatura} alt={video.titulo} width="100%" />
            <p style={{ fontSize: 14, fontWeight: "bold" }}>{video.titulo}</p>
            <p style={{ fontSize: 12, color: "#666" }}>{video.canal}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

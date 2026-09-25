"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Mesa {
  id: string;
  numero: number;
  creditosDisponibles: number;
}

export default function Home() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarMesas() {
      const snapshot = await getDocs(collection(db, "mesas"));
      const datos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Mesa[];
      setMesas(datos);
      setCargando(false);
    }
    cargarMesas();
  }, []);

  if (cargando) return <p style={{ padding: 20 }}>Cargando mesas...</p>;

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>🎵 Prueba de conexión — Rockola Bar</h1>
      <p>Mesas encontradas en Firestore: {mesas.length}</p>
      <ul>
        {mesas.map((mesa) => (
          <li key={mesa.id}>
            Mesa #{mesa.numero} — Créditos disponibles: {mesa.creditosDisponibles}
          </li>
        ))}
      </ul>
    </div>
  );
}
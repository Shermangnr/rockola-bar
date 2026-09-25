"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Mesa {
  numero: number;
  creditosDisponibles: number;
}

export default function VistaMesa() {
  const params = useParams();
  const numeroMesa = params.numero as string;

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [existe, setExiste] = useState(true);

  useEffect(() => {
    async function cargarMesa() {
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
    cargarMesa();
  }, [numeroMesa]);

  if (cargando) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

  if (!existe) {
    return (
      <div style={{ padding: 20 }}>
        <h1>⚠️ Mesa no encontrada</h1>
        <p>La mesa #{numeroMesa} no existe. Verifica el código QR.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>🎵 Mesa #{mesa?.numero}</h1>
      <p style={{ fontSize: 20 }}>
        Créditos disponibles: <strong>{mesa?.creditosDisponibles}</strong>
      </p>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; // Asegúrate de exportar 'db' en tu lib/firebase.ts

// Definimos las interfaces para TypeScript basadas en tu modelo de datos
interface Cancion {
  id: string;
  titulo: string;
  artista: string;
  genero: string;
  mesaId: string;
  estado: "pendiente" | "reproducida";
}

interface Mesa {
  id: string;
  numero: number;
  creditosDisponibles: number;
}

export default function VistaAdmin() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  // Nuevos estados para almacenar los datos de Firestore
  const [canciones, setCanciones] = useState<Cancion[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);

  // Efecto para la autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setCargandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Efecto para escuchar Firestore (SOLO si hay un usuario logueado)
  useEffect(() => {
    if (!usuario) return; // Si no hay usuario, no consultamos la BD

    // Escuchar las mesas
    const unsubscribeMesas = onSnapshot(collection(db, "mesas"), (snapshot) => {
      const mesasData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Mesa[];
      
      // Ordenamos las mesas por número de menor a mayor
      mesasData.sort((a, b) => a.numero - b.numero);
      setMesas(mesasData);
    });

    // Escuchar la cola de canciones (ordenadas por fecha de creación)
    const qCanciones = query(collection(db, "colaCanciones"), orderBy("creadaEn", "asc"));
    const unsubscribeCanciones = onSnapshot(qCanciones, (snapshot) => {
      const cancionesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Cancion[];
      
      setCanciones(cancionesData);
    });

    // Limpiamos los "listeners" cuando el componente se desmonta o el usuario cierra sesión
    return () => {
      unsubscribeMesas();
      unsubscribeCanciones();
    };
  }, [usuario]);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setErrorLogin(null);
    setEntrando(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setErrorLogin("Correo o contraseña incorrectos.");
    }
    setEntrando(false);
  }

  async function cerrarSesion() {
    await signOut(auth);
    setEmail("");
    setPassword("");
    setErrorLogin(null);
  }

  if (cargandoAuth) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

  if (!usuario) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 400 }}>
        <h1>🔒 Administrador</h1>
        <form onSubmit={iniciarSesion}>
          <div style={{ marginBottom: 10 }}>
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 8, width: "100%" }}
              required
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 8, width: "100%" }}
              required
            />
          </div>
          <button type="submit" disabled={entrando} style={{ padding: "8px 16px" }}>
            {entrando ? "Entrando..." : "Entrar"}
          </button>
          {errorLogin && <p style={{ color: "red", marginTop: 10 }}>{errorLogin}</p>}
        </form>
      </div>
    );
  }

  // Interfaz del panel una vez logueado
  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>🎛️ Panel de Administrador</h1>
        <button onClick={cerrarSesion} style={{ padding: "6px 12px" }}>
          Cerrar sesión
        </button>
      </div>
      
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        
        {/* Columna de Mesas */}
        <div style={{ flex: 1, minWidth: "300px", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
          <h2>Estado de Mesas</h2>
          {mesas.map(mesa => (
            <div key={mesa.id} style={{ padding: "8px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>Mesa {mesa.numero}</span>
              <strong>{mesa.creditosDisponibles} créditos</strong>
            </div>
          ))}
        </div>

        {/* Columna de Canciones */}
        <div style={{ flex: 2, minWidth: "300px", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
          <h2>Cola de Canciones</h2>
          {canciones.length === 0 ? <p>No hay canciones en la base de datos.</p> : null}
          {canciones.map(cancion => (
            <div key={cancion.id} style={{ padding: "8px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{cancion.titulo}</strong>
                <div style={{ fontSize: "0.8em", color: "#666" }}>
                  {cancion.artista} • {cancion.genero}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ 
                  display: "inline-block", 
                  padding: "2px 6px", 
                  borderRadius: "4px", 
                  fontSize: "0.8em",
                  backgroundColor: cancion.estado === "pendiente" ? "#e6f7ff" : "#f6ffed",
                  color: cancion.estado === "pendiente" ? "#0050b3" : "#389e0d"
                }}>
                  {cancion.estado}
                </span>
                <div style={{ fontSize: "0.8em", marginTop: "4px" }}>Mesa {cancion.mesaId}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
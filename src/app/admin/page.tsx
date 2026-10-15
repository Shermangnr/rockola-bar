"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  updateDoc,
  doc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { writeBatch } from "firebase/firestore";
import Swal from "sweetalert2";

interface Cancion {
  id: string;
  titulo: string;
  artista: string;
  genero: string;
  mesaId: string;
  estado: "pendiente" | "reproducida" | "error";
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

  const [canciones, setCanciones] = useState<Cancion[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setCargandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario) return;

    const unsubscribeMesas = onSnapshot(collection(db, "mesas"), (snapshot) => {
      const mesasData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Mesa[];
      mesasData.sort((a, b) => a.numero - b.numero);
      setMesas(mesasData);
    });

    const qCanciones = query(collection(db, "colaCanciones"), orderBy("creadaEn", "asc"));
    const unsubscribeCanciones = onSnapshot(qCanciones, (snapshot) => {
      const cancionesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Cancion[];
      setCanciones(cancionesData);
    });

    return () => {
      unsubscribeMesas();
      unsubscribeCanciones();
    };
  }, [usuario]);

  // --- NUEVAS FUNCIONES DE ADMINISTRADOR ---

  async function ajustarCreditos(mesaId: string, creditosActuales: number, ajuste: number) {
    const nuevosCreditos = creditosActuales + ajuste;
    if (nuevosCreditos < 0) return; // Evitar que los créditos sean negativos

    try {
      await updateDoc(doc(db, "mesas", mesaId), {
        creditosDisponibles: nuevosCreditos
      });
    } catch (error) {
      console.error("Error al actualizar créditos:", error);
      alert("Hubo un error al actualizar los créditos.");
    }
  }

  async function eliminarCancion(cancionId: string) {
    const confirmar = await Swal.fire({
      title: "¿Eliminar canción?",
      text: "Desaparecerá de la cola definitivamente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ff4d4f",
      cancelButtonColor: "#d9d9d9",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (!confirmar.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "colaCanciones", cancionId));
      Swal.fire({
        title: "¡Eliminada!",
        icon: "success",
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error al eliminar canción:", error);
      Swal.fire("Error", "Hubo un problema al eliminar la canción.", "error");
    }
  }

  async function limpiarHistorial() {
    const confirmar = await Swal.fire({
      title: "¿Limpiar historial?",
      text: "Se borrarán todas las canciones ya reproducidas o con error. Las pendientes no se verán afectadas.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#ff4d4f",
      cancelButtonColor: "#d9d9d9",
      confirmButtonText: "🧹 Sí, limpiar todo",
      cancelButtonText: "Cancelar"
    });

    if (!confirmar.isConfirmed) return;

    try {
      const batch = writeBatch(db);
      const cancionesReproducidas = canciones.filter(c => c.estado === "reproducida" || c.estado === "error");

      if (cancionesReproducidas.length === 0) {
        Swal.fire("Nada que limpiar", "No hay canciones reproducidas actualmente.", "info");
        return;
      }

      cancionesReproducidas.forEach(cancion => {
        const cancionRef = doc(db, "colaCanciones", cancion.id);
        batch.delete(cancionRef);
      });

      await batch.commit();
      
      Swal.fire({
        title: "¡Historial limpio!",
        icon: "success",
        timer: 1500,
        showConfirmButton: false
      });
      
    } catch (error) {
      console.error("Error al limpiar historial:", error);
      Swal.fire("Error", "Hubo un error al limpiar el historial.", "error");
    }
  }

  // -----------------------------------------

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
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", fontFamily: "sans-serif" }}>
        <div style={{
          border: "4px solid rgba(0, 0, 0, 0.1)",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          borderLeftColor: "#000",
          animation: "spin 1s linear infinite",
          marginBottom: "15px"
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <p style={{ fontSize: "18px", color: "#666" }}>Cargando panel...</p>
      </div>
    );
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

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>🎛️ Panel de Administrador</h1>
        <button onClick={cerrarSesion} style={{ padding: "6px 12px" }}>
          Cerrar sesión
        </button>
      </div>

      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>

        <div style={{ flex: 1, minWidth: "350px", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
          <h2>Estado de Mesas</h2>
          {mesas.map(mesa => (
            <div key={mesa.id} style={{ padding: "12px 8px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Mesa {mesa.numero}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => ajustarCreditos(mesa.id, mesa.creditosDisponibles, -1)}
                  style={{ padding: "2px 8px", cursor: "pointer" }}
                  disabled={mesa.creditosDisponibles <= 0}
                >
                  -
                </button>
                <strong>{mesa.creditosDisponibles} cr</strong>
                <button
                  onClick={() => ajustarCreditos(mesa.id, mesa.creditosDisponibles, 1)}
                  style={{ padding: "2px 8px", cursor: "pointer" }}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 2, minWidth: "350px", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2 style={{ margin: 0 }}>Cola de Canciones</h2>
            <button
              onClick={limpiarHistorial}
              style={{
                padding: "6px 12px",
                backgroundColor: "#ff4d4f",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9em"
              }}
            >
              🧹 Limpiar reproducidas
            </button>
          </div>
          {canciones.length === 0 ? <p>No hay canciones en la base de datos.</p> : null}
          {canciones.map(cancion => (
            <div key={cancion.id} style={{ padding: "10px 8px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{cancion.titulo}</strong>
                <div style={{ fontSize: "0.8em", color: "#666" }}>
                  {cancion.artista} • {cancion.genero}
                </div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <span style={{
                  display: "inline-block",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "0.8em",
                  backgroundColor: cancion.estado === "pendiente" ? "#e6f7ff" : cancion.estado === "error" ? "#fff1f0" : "#f6ffed",
                  color: cancion.estado === "pendiente" ? "#0050b3" : cancion.estado === "error" ? "#cf1322" : "#389e0d"
                }}>
                  {cancion.estado}
                </span>
                <div style={{ fontSize: "0.8em" }}>Mesa {cancion.mesaId}</div>
                <button
                  onClick={() => eliminarCancion(cancion.id)}
                  style={{
                    fontSize: "0.8em",
                    padding: "2px 6px",
                    backgroundColor: "#ff4d4f",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, orderBy, setDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import Swal from "sweetalert2";

interface Mesa {
  id: string;
  numero: number;
  creditosDisponibles: number;
}

interface Cancion {
  id: string;
  titulo: string;
  artista: string;
  genero: string;
  mesaId: string;
  estado: "pendiente" | "reproducida" | "error";
  creadaEn: any;
}

export default function PanelAdmin() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [canciones, setCanciones] = useState<Cancion[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setCargandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario) return;

    const qMesas = query(collection(db, "mesas"));
    const unsubMesas = onSnapshot(qMesas, (snapshot) => {
      const ms = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Mesa));
      ms.sort((a, b) => a.numero - b.numero);
      setMesas(ms);
    });

    const qCanciones = query(collection(db, "colaCanciones"), orderBy("creadaEn", "asc"));
    const unsubCanciones = onSnapshot(qCanciones, (snapshot) => {
      const cs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Cancion));
      setCanciones(cs);
    });

    return () => {
      unsubMesas();
      unsubCanciones();
    };
  }, [usuario]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      Swal.fire({ title: "Error", text: "Credenciales incorrectas", icon: "error", background: "#1a1a1c", color: "#fff" });
    }
  }

  async function logout() {
    await signOut(auth);
  }

  // ================== GESTIÓN DE MESAS ==================

  async function crearNuevaMesa() {
    const { value: numeroStr } = await Swal.fire({
      title: "Crear Nueva Mesa",
      input: "number",
      inputLabel: "Ingresa el número de la mesa",
      inputPlaceholder: "Ej: 4",
      showCancelButton: true,
      confirmButtonText: "Crear Mesa",
      cancelButtonText: "Cancelar",
      background: "#1a1a1c",
      color: "#fff",
      confirmButtonColor: "#eab308",
      cancelButtonColor: "#262626",
      inputValidator: (value) => {
        if (!value) return "Debes ingresar un número";
        const num = parseInt(value);
        if (num <= 0) return "El número debe ser mayor a 0";
        if (mesas.some(m => m.numero === num)) return "¡Esta mesa ya existe!";
      }
    });

    if (numeroStr) {
      const numero = parseInt(numeroStr);
      try {
        // Usamos setDoc para que el ID del documento sea exactamente el número de la mesa
        await setDoc(doc(db, "mesas", String(numero)), {
          numero: numero,
          creditosDisponibles: 0,
          ventanaInicio: serverTimestamp()
        });
        Swal.fire({ title: "¡Mesa Creada!", icon: "success", timer: 1500, showConfirmButton: false, background: "#1a1a1c", color: "#fff" });
      } catch (error) {
        Swal.fire({ title: "Error", text: "No se pudo crear la mesa.", icon: "error", background: "#1a1a1c", color: "#fff" });
      }
    }
  }

  async function eliminarMesa(mesaId: string, numero: number) {
    const confirmar = await Swal.fire({
      title: `¿Eliminar Mesa ${numero}?`,
      text: "Se borrará su acceso y sus créditos disponibles. Las canciones que ya pidió seguirán en la cola.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ff4d4f",
      cancelButtonColor: "#262626",
      background: "#1a1a1c",
      color: "#fff",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (!confirmar.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "mesas", mesaId));
      Swal.fire({ title: "¡Mesa eliminada!", icon: "success", timer: 1500, showConfirmButton: false, background: "#1a1a1c", color: "#fff" });
    } catch (error) {
      Swal.fire({ title: "Error", text: "Hubo un problema al eliminar la mesa.", icon: "error", background: "#1a1a1c", color: "#fff" });
    }
  }

  async function ajustarCreditos(mesaId: string, cantidad: number) {
    const ref = doc(db, "mesas", mesaId);
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) return;

    const nuevoValor = Math.max(0, mesa.creditosDisponibles + cantidad);
    await updateDoc(ref, { creditosDisponibles: nuevoValor });
  }

  // ================== GESTIÓN DE CANCIONES ==================

  async function eliminarCancion(cancionId: string) {
    const confirmar = await Swal.fire({
      title: "¿Eliminar canción?",
      text: "Desaparecerá de la cola definitivamente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ff4d4f",
      cancelButtonColor: "#262626",
      background: "#1a1a1c",
      color: "#fff",
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
        showConfirmButton: false,
        background: "#1a1a1c",
        color: "#fff",
      });
    } catch (error) {
      Swal.fire({ title: "Error", text: "Hubo un problema.", icon: "error", background: "#1a1a1c", color: "#fff" });
    }
  }

  async function limpiarHistorial() {
    const confirmar = await Swal.fire({
      title: "¿Limpiar historial?",
      text: "Se borrarán todas las canciones reproducidas o con error.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#ff4d4f",
      cancelButtonColor: "#262626",
      background: "#1a1a1c",
      color: "#fff",
      confirmButtonText: "🧹 Sí, limpiar todo",
      cancelButtonText: "Cancelar"
    });

    if (!confirmar.isConfirmed) return;

    try {
      const batch = writeBatch(db);
      const reproducidas = canciones.filter(c => c.estado === "reproducida" || c.estado === "error");

      if (reproducidas.length === 0) {
        Swal.fire({ title: "Nada que limpiar", text: "No hay canciones en el historial.", icon: "info", background: "#1a1a1c", color: "#fff" });
        return;
      }

      reproducidas.forEach(c => batch.delete(doc(db, "colaCanciones", c.id)));
      await batch.commit();
      
      Swal.fire({ title: "¡Historial limpio!", icon: "success", timer: 1500, showConfirmButton: false, background: "#1a1a1c", color: "#fff" });
    } catch (error) {
      Swal.fire({ title: "Error", text: "Error al limpiar.", icon: "error", background: "#1a1a1c", color: "#fff" });
    }
  }

  if (cargandoAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] font-sans">
        <div className="w-10 h-10 border-4 border-neutral-800 border-l-yellow-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-lg">Cargando terminal...</p>
      </div>
    );
  }

  // ================== VISTA DE LOGIN ==================
  if (!usuario) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col font-sans relative text-white selection:bg-yellow-500/30">
        <div className="flex justify-between items-center px-8 py-4 border-b border-white/5 text-xs font-mono tracking-widest text-neutral-500 uppercase">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            Terminal Administrativo Especializado
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">📊 Rockola Link: <span className="text-emerald-500">En Línea</span></span>
            <span className="flex items-center gap-2 text-yellow-600">🛡️ SSL 256-Bit</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-neutral-800/80 rounded-2xl p-8 max-w-md w-full shadow-2xl shadow-black">
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full border border-yellow-500/30 overflow-hidden flex items-center justify-center bg-[#0a0a0a] shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                <img src="/logo-la-oficina.jpg" alt="Logo" className="w-full h-full object-contain scale-110" />
              </div>
            </div>
            
            <h1 className="text-2xl font-serif font-bold text-center mb-1">PORTAL DE</h1>
            <h1 className="text-2xl font-serif font-bold text-center mb-2">ADMINISTRACIÓN</h1>
            <p className="text-center text-neutral-400 text-sm mb-8 pb-6 border-b border-neutral-800/50">
              Control de Rockola y Gestión de Mesas
            </p>

            <form onSubmit={login} className="space-y-5">
              <div>
                <label className="block text-xs font-bold tracking-wider text-neutral-400 mb-2 uppercase">Correo Electrónico</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">✉️</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-yellow-500/50 text-white transition-colors"
                    placeholder="admin@laoficina.bar"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold tracking-wider text-neutral-400 uppercase">Contraseña</label>
                  <span className="text-xs text-yellow-600 hover:text-yellow-500 cursor-pointer">¿Olvidaste tu contraseña?</span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-600">🔑</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-lg py-3 pl-10 pr-10 focus:outline-none focus:border-yellow-500/50 text-white tracking-widest transition-colors"
                    placeholder="••••••••••••"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 pb-4">
                <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
                  <input type="checkbox" className="accent-yellow-600 w-4 h-4 rounded border-neutral-700 bg-neutral-900" />
                  Mantener sesión activa
                </label>
                <span className="text-xs flex items-center gap-1 text-neutral-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Servidor Bar</span>
              </div>

              <button type="submit" className="w-full bg-[#dca54c] hover:bg-[#eab308] text-black font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                ENTRAR AL SISTEMA ➔
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-neutral-800/50 flex justify-between text-[10px] text-neutral-500 tracking-wider">
              <span className="flex items-center gap-1">🛡️ Acceso Exclusivo Personal</span>
              <span>v2.4.0-PRO</span>
            </div>
          </div>
        </div>

        <div className="py-6 border-t border-white/5 flex justify-center text-sm text-neutral-500">
          ¿Problemas para acceder? <span className="text-yellow-600 ml-1 cursor-pointer">Contactar a Soporte Técnico</span>
        </div>
      </div>
    );
  }

  // ================== VISTA DE DASHBOARD ADMIN ==================
  const pendientes = canciones.filter((c) => c.estado === "pendiente");
  
  return (
    <div className="min-h-screen bg-[#111113] text-white font-sans">
      
      {/* NAVBAR */}
      <nav className="bg-[#161618] border-b border-neutral-800 px-6 py-3 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full border border-yellow-500/30 overflow-hidden flex items-center justify-center bg-[#0a0a0a]">
            <img src="/logo-la-oficina.jpg" alt="Logo" className="w-full h-full object-contain scale-110" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-yellow-500 text-lg tracking-wide uppercase">La Oficina</h1>
              <span className="text-neutral-600">|</span>
              <span className="text-neutral-300 font-medium">Panel de Administrador</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> En vivo</span>
              <span>•</span>
              <span>Rockola Digital Conectada</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex bg-[#0a0a0a] border border-neutral-800 rounded-full px-4 py-1.5 text-sm gap-4">
            <span className="flex items-center gap-2 text-neutral-300">💿 <strong className="text-white">{pendientes.length}</strong> temas listados</span>
            <span className="text-neutral-700">|</span>
            <span className="flex items-center gap-2 text-neutral-300">🪑 <strong className="text-white">{mesas.filter(m => m.creditosDisponibles > 0).length}</strong> mesas con saldo</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">Gerencia / Dj Master</p>
              <p className="text-xs text-yellow-600">Turno Nocturno</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#dca54c] text-black flex items-center justify-center text-lg font-bold">
              👤
            </div>
            <button onClick={logout} className="border border-neutral-700 hover:bg-neutral-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <span className="text-red-400">↪</span> Cerrar sesión
            </button>
          </div>
        </div>
      </nav>

      <div className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMNA IZQUIERDA: MESAS */}
        <div className="lg:col-span-4 bg-[#161618] border border-neutral-800 rounded-2xl p-6 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                <span className="text-yellow-500">🪑</span> Estado de Mesas
              </h2>
              <p className="text-sm text-neutral-400 mt-1">Control de saldo para peticiones</p>
            </div>
            {/* BOTÓN NUEVA MESA ACTIVADO */}
            <button onClick={crearNuevaMesa} className="border border-yellow-600/50 text-yellow-500 hover:bg-yellow-600/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              + Nueva Mesa
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {mesas.map((m) => {
              const tieneSaldo = m.creditosDisponibles > 0;
              return (
                <div key={m.id} className="bg-[#1a1a1c] border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border border-yellow-500/20 bg-yellow-500/5 text-yellow-500 flex items-center justify-center font-bold text-lg font-mono">
                      {String(m.numero).padStart(2, '0')}
                    </div>
                    <div>
                      <p className="font-bold text-white mb-1">Mesa {m.numero}</p>
                      <div className="flex items-center gap-2">
                        {tieneSaldo ? (
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded">Ocupada</span>
                        ) : (
                          <span className="bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded">Libre / Sin créditos</span>
                        )}
                        {tieneSaldo && <span className="text-xs text-neutral-500">{m.creditosDisponibles} solicitudes</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#242426] border border-neutral-700 rounded-lg overflow-hidden">
                      <button onClick={() => ajustarCreditos(m.id, -1)} className="px-3 py-2 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors border-r border-neutral-700 font-bold">−</button>
                      <span className="px-4 py-2 font-bold text-white min-w-[3rem] text-center">{m.creditosDisponibles} <span className="text-xs text-neutral-500 font-normal">cr</span></span>
                      <button onClick={() => ajustarCreditos(m.id, 1)} className="px-3 py-2 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors border-l border-neutral-700 font-bold">+</button>
                    </div>
                    {/* BOTÓN ELIMINAR MESA */}
                    <button 
                      onClick={() => eliminarMesa(m.id, m.numero)}
                      title="Eliminar Mesa"
                      className="p-2 text-neutral-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 pt-4 border-t border-neutral-800 text-center">
            <p className="text-yellow-600/70 font-serif italic text-sm">"Horas Extras Aseguradas en La Oficina"</p>
          </div>
        </div>

        {/* COLUMNA DERECHA: COLA DE CANCIONES */}
        <div className="lg:col-span-8 bg-[#161618] border border-neutral-800 rounded-2xl p-6 flex flex-col min-h-[70vh]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                  <span className="w-6 h-6 rounded bg-[#2a2a2c] border border-neutral-700 inline-block"></span> Cola de Canciones
                </h2>
                <span className="border border-yellow-600 text-yellow-500 text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-600/10">
                  {pendientes.length} en lista
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1">Historial de solicitudes de clientes</p>
            </div>
            <button onClick={limpiarHistorial} className="bg-red-500 hover:bg-red-600 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2">
              🧹 Limpiar reproducidas
            </button>
          </div>

          <div className="flex-1 bg-[#1a1a1c] border border-neutral-800/80 rounded-xl overflow-hidden">
            <div className="h-full overflow-y-auto p-2 custom-scrollbar">
              {canciones.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-neutral-500 py-20">
                  <span className="text-4xl mb-3">💿</span>
                  <p>No hay canciones en el registro.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {canciones.map((c, index) => {
                    const isRepro = c.estado === "reproducida";
                    const isError = c.estado === "error";
                    
                    return (
                      <div key={c.id} className="flex items-center justify-between p-4 border-b border-neutral-800/50 hover:bg-[#222225] transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full border border-neutral-700 bg-[#161618] text-neutral-400 flex items-center justify-center font-bold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-white text-base mb-0.5 group-hover:text-yellow-500 transition-colors">{c.titulo}</p>
                            <p className="text-sm text-neutral-400">{c.artista} • {c.genero}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            {isRepro && <span className="inline-block border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded mb-1">✓ reproducida</span>}
                            {isError && <span className="inline-block border border-red-500/30 text-red-400 bg-red-500/10 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded mb-1">✕ error</span>}
                            {!isRepro && !isError && <span className="inline-block border border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded mb-1">⏳ pendiente</span>}
                            <p className="text-sm font-semibold text-neutral-300">Mesa {c.mesaId}</p>
                          </div>
                          <button 
                            onClick={() => eliminarCancion(c.id)}
                            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center text-xs text-neutral-500 px-2">
            <span className="flex items-center gap-2">ℹ️ Las canciones se reproducen automáticamente en orden de llegada.</span>
            <span>Auto-refresh: <strong className="text-emerald-500 font-normal">Activo (5s)</strong></span>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>
    </div>
  );
}
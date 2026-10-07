import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const estadoFinal = body.estado || "reproducida"; 
        const cancionId = body.cancionId;

        if (!cancionId) {
            return NextResponse.json({ error: "Falta el ID de la canción" }, { status: 400 });
        }

        if (estadoFinal === "error") {
            await adminDb.runTransaction(async (transaction) => {
                const cancionRef = adminDb.collection("colaCanciones").doc(cancionId);
                
                // === 1. FASE DE LECTURAS (READS) ===
                const cancionSnap = await transaction.get(cancionRef);
                if (!cancionSnap.exists) return;

                const cancionData = cancionSnap.data();
                const mesaId = cancionData?.mesaId;
                
                let mesaRef = null;
                let mesaSnap = null;
                
                // Leemos la mesa (Aún no hemos escrito nada, así que es seguro)
                if (mesaId) {
                    mesaRef = adminDb.collection("mesas").doc(String(mesaId));
                    mesaSnap = await transaction.get(mesaRef);
                }

                // === 2. FASE DE ESCRITURAS (WRITES) ===
                // Marcamos la canción
                transaction.update(cancionRef, { estado: "error" });

                // Devolvemos el crédito
                if (mesaRef && mesaSnap && mesaSnap.exists) {
                    const creditosActuales = mesaSnap.data()?.creditosDisponibles || 0;
                    transaction.update(mesaRef, { creditosDisponibles: creditosActuales + 1 });
                }
            });
        } else {
            // Flujo normal: sin transacción, solo escritura directa
            await adminDb.collection("colaCanciones").doc(cancionId).update({
                estado: estadoFinal
            });
        }

        return NextResponse.json({ ok: true, estado: estadoFinal });
    } catch (error: any) {
        console.error("Error al actualizar estado:", error);
        return NextResponse.json({ error: "Error al actualizar el estado" }, { status: 500 });
    }
}
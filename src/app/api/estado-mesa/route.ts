import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { INTERVALO_MINUTOS, CREDITOS_POR_INTERVALO } from "@/lib/creditos";

export async function GET(request: NextRequest) {
    const numeroMesa = request.nextUrl.searchParams.get("numeroMesa");

    if (!numeroMesa) {
        return NextResponse.json({ error: "Falta numeroMesa" }, { status: 400 });
    }

    const ref = adminDb.collection("mesas").doc(numeroMesa);
    const snap = await ref.get();

    if (!snap.exists) {
        return NextResponse.json({ error: "La mesa no existe" }, { status: 404 });
    }

    const data = snap.data()!;
    const creditosActuales = data.creditosDisponibles as number;

    // Mientras queden créditos, no hay nada que revisar: el reloj aún no ha arrancado
    if (creditosActuales > 0) {
        return NextResponse.json({
            numero: data.numero,
            creditosDisponibles: creditosActuales,
            seReinicio: false,
        });
    }

    const ventanaInicio = data.ventanaInicio as Timestamp;
    const ahora = Date.now();
    const minutosTranscurridos = (ahora - ventanaInicio.toMillis()) / 1000 / 60;

    if (minutosTranscurridos >= INTERVALO_MINUTOS) {
        await ref.update({
            creditosDisponibles: CREDITOS_POR_INTERVALO,
            ventanaInicio: Timestamp.now(),
        });

        return NextResponse.json({
            numero: data.numero,
            creditosDisponibles: CREDITOS_POR_INTERVALO,
            seReinicio: true,
        });
    }

    return NextResponse.json({
        numero: data.numero,
        creditosDisponibles: data.creditosDisponibles,
        seReinicio: false,
    });
}
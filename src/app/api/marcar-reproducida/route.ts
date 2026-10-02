import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { error } from "console";

export async function POST(request: NextRequest) {
    const { cancionId } = await request.json();

    if (!cancionId) {
        return NextResponse.json({ error: "Falta cancionId" }, { status: 400 });
    }

    await adminDb.collection("colaCanciones").doc(cancionId).update({
        estado: "reproducida",
    });

    return NextResponse.json({ ok:true });
}
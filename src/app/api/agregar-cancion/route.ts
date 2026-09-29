import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";

const GENEROS = [
    "Salsa",
    "Merengue",
    "Vallenato",
    "Reguetón",
    "Bachata",
    "Champeta",
    "Popular / Despecho",
    "Banda",
    "Balada Romántica",
    "Crossover / Mix",
];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function clasificarGenero(titulo: string, canal: string) {
    const prompt = `Eres un clasificador de música para un bar de baile. Dado el título y canal de un video de YouTube, responde ÚNICAMENTE con una de estas palabras exactas: ${GENEROS.join(
        ", "
    )}, o RECHAZAR si el género no encaja en un bar de baile (rock, metal, punk, música infantil, contenido no musical, etc).

Título: "${titulo}"
Canal: "${canal}"

Responde solo con la palabra, nada más.`;

    const respuesta = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: prompt,
    });

    const texto = respuesta.text?.trim() ?? "";

    if (GENEROS.includes(texto)) return texto;
    return null; // Rechazada o respuesta no reconocida
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { numeroMesa, videoId, titulo, canal } = body;

    if (!numeroMesa || !videoId || !titulo || !canal) {
        return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const genero = await clasificarGenero(titulo, canal);

    if (!genero) {
        return NextResponse.json(
            { error: "Esta canción no encaja con el ambiente del bar. Intenta con otra." },
            { status: 422 }
        );
    }

    const mesaRef = adminDb.collection("mesas").doc(String(numeroMesa));
    const colaRef = adminDb.collection("colaCanciones");

    try {
        await adminDb.runTransaction(async (transaction) => {
            const mesaSnap = await transaction.get(mesaRef);

            if (!mesaSnap.exists) {
                throw new Error("La mesa no existe.");
            }

            const creditos = mesaSnap.data()?.creditosDisponibles as number;

            if (creditos <= 0) {
                throw new Error("No te quedan créditos disponibles esta hora.");
            }

            transaction.update(mesaRef, { creditosDisponibles: creditos - 1 });

            const nuevaCancionRef = colaRef.doc();
            transaction.set(nuevaCancionRef, {
                titulo,
                artista: canal,
                genero,
                youtubeVideoId: videoId,
                mesaId: String(numeroMesa),
                estado: "pendiente",
                creadaEn: FieldValue.serverTimestamp(),
            });
        });

        return NextResponse.json({ ok: true, genero });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || "Error al agregar la canción" },
            { status: 400 }
        );
    }
}
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

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

// Constante para el bloqueo de repeticiones (ej. 2 horas en milisegundos)
const HORAS_BLOQUEO = 2;
const MILISEGUNDOS_BLOQUEO = HORAS_BLOQUEO * 60 * 60 * 1000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analizarVideo(titulo: string, canal: string) {
    const prompt = `Eres un experto musical para un bar de baile. Analiza este video de YouTube:
Título: "${titulo}"
Canal: "${canal}"

Debes hacer 3 cosas:
1. Identificar el género musical. Debe ser exactamente UNO de estos: ${GENEROS.join(", ")}, o "RECHAZAR" si es rock, metal, música infantil, o no encaja en el bar.
2. Extraer ÚNICAMENTE el nombre del artista PRINCIPAL. Ignora por completo a los artistas invitados, no incluyas "ft.", "feat", "y", ni comas. Solo el primer artista.
3. Extraer el nombre de la canción (limpio, ignorando textos como "Video Oficial", "Letra", "Remix", "Audio", etc).

Responde ÚNICAMENTE con un JSON válido con esta estructura, sin texto adicional ni formato de markdown:
{
    "genero": "Salsa",
    "artista": "Nombre Artista Principal",
    "cancion": "Nombre Cancion"
}`;

    const timeoutPromesa = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_GEMINI")), 8000)
    );

    try {
        const respuestaPromesa = ai.models.generateContent({
            model: "gemini-flash-lite-latest",
            contents: prompt,
        });

        const respuesta = await Promise.race([respuestaPromesa, timeoutPromesa]) as any;
        let texto = respuesta.text?.trim() ?? "";

        texto = texto.replace(/```json/gi, "").replace(/```/g, "").trim();

        const data = JSON.parse(texto);
        const generoFinal = GENEROS.includes(data.genero) ? data.genero : null;

        const limpiarTexto = (txt: string) =>
            txt.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "");

        const firmaArtista = limpiarTexto(data.artista);
        const firmaCancion = limpiarTexto(data.cancion);

        const firma = `${firmaArtista}${firmaCancion}`;

        return {
            genero: generoFinal,
            artistaLimpio: data.artista,
            cancionLimpia: data.cancion,
            firma: firma
        };
    } catch (error: any) {
        if (error.message === "TIMEOUT_GEMINI") return "TIMEOUT";
        console.error("Error analizando con Gemini:", error);
        return null;
    }
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { numeroMesa, videoId, titulo, canal } = body;

    if (!numeroMesa || !videoId || !titulo || !canal) {
        return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const colaRef = adminDb.collection("colaCanciones");

    // 1. Check rápido por ID exacto de YouTube
    const yaEnColaRapido = await colaRef
        .where("youtubeVideoId", "==", videoId)
        .where("estado", "==", "pendiente")
        .limit(1)
        .get();

    if (!yaEnColaRapido.empty) {
        return NextResponse.json(
            { error: "Esta canción ya está en la cola. Intenta con otra." },
            { status: 409 }
        );
    }

    // 2. IA analiza la canción
    const analisis = await analizarVideo(titulo, canal);

    if (analisis === "TIMEOUT") {
        return NextResponse.json(
            { error: "Nuestros servidores están un poco lentos. Por favor, intenta de nuevo." },
            { status: 504 }
        );
    }

    if (!analisis || !analisis.genero) {
        return NextResponse.json(
            { error: "Esta canción no encaja con el ambiente del bar o no pudo ser procesada." },
            { status: 422 }
        );
    }

    const mesaRef = adminDb.collection("mesas").doc(String(numeroMesa));

    try {
        await adminDb.runTransaction(async (transaction) => {

            // Check 3.1: ¿Está la misma huella PENDIENTE en la cola ahora mismo?
            const queryDuplicadoPendiente = colaRef
                .where("firma", "==", analisis.firma)
                .where("estado", "==", "pendiente")
                .limit(1);

            const duplicadoPendienteSnap = await transaction.get(queryDuplicadoPendiente);

            if (!duplicadoPendienteSnap.empty) {
                throw new Error("DUPLICADO_FIRMA");
            }

            // Check 3.2: NUEVO - ¿Se reprodujo esta misma canción en las últimas 2 horas?
            const queryRepetida = colaRef
                .where("firma", "==", analisis.firma)
                .where("estado", "==", "reproducida");

            const repetidaSnap = await transaction.get(queryRepetida);
            const tiempoLimite = Date.now() - MILISEGUNDOS_BLOQUEO;

            let sonoHacePoco = false;
            repetidaSnap.forEach((doc) => {
                const data = doc.data();
                if (data.creadaEn) {
                    const tiempoCreacion = data.creadaEn.toMillis();
                    if (tiempoCreacion > tiempoLimite) {
                        sonoHacePoco = true;
                    }
                }
            });

            if (sonoHacePoco) {
                throw new Error("REPETIDA_RECIENTE");
            }

            // Validar créditos de la mesa
            const mesaSnap = await transaction.get(mesaRef);

            if (!mesaSnap.exists) {
                throw new Error("La mesa no existe.");
            }

            const mesaData = mesaSnap.data()!;
            const creditosActuales = mesaData.creditosDisponibles as number;

            if (creditosActuales <= 0) {
                throw new Error("No te quedan créditos disponibles esta hora.");
            }

            const nuevosCreditos = creditosActuales - 1;
            const seAgotaronAhora = nuevosCreditos === 0;

            transaction.update(mesaRef, {
                creditosDisponibles: nuevosCreditos,
                ...(seAgotaronAhora ? { ventanaInicio: Timestamp.now() } : {}),
            });

            const nuevaCancionRef = colaRef.doc();
            transaction.set(nuevaCancionRef, {
                titulo: analisis.cancionLimpia,
                artista: analisis.artistaLimpio,
                genero: analisis.genero,
                youtubeVideoId: videoId,
                mesaId: String(numeroMesa),
                estado: "pendiente",
                creadaEn: FieldValue.serverTimestamp(),
                firma: analisis.firma
            });
        });

        return NextResponse.json({ ok: true, genero: analisis.genero });
    } catch (error: any) {
        if (error.message === "DUPLICADO_FIRMA") {
            return NextResponse.json(
                { error: "¡Esta canción ya está en la cola en otro video! Por favor elige una diferente." },
                { status: 409 }
            );
        }
        if (error.message === "REPETIDA_RECIENTE") {
            return NextResponse.json(
                { error: `Esta canción ya sonó en las últimas ${HORAS_BLOQUEO} horas. ¡Cambiemos un poco el ritmo!` },
                { status: 429 } // 429 Too Many Requests
            );
        }
        return NextResponse.json(
            { error: error.message || "Error al agregar la canción" },
            { status: 400 }
        );
    }
}
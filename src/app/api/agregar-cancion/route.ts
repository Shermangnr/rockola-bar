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

        // Limpiamos los backticks (```json) por si Gemini decide formatearlo
        texto = texto.replace(/```json/gi, "").replace(/```/g, "").trim();

        const data = JSON.parse(texto);
        const generoFinal = GENEROS.includes(data.genero) ? data.genero : null;

        // Función para limpiar texto: forzar minúsculas, quitar tildes y dejar solo letras/números
        const limpiarTexto = (txt: string) => 
            txt.toLowerCase()
               .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Elimina tildes (ej. á -> a)
               .replace(/[^a-z0-9]/g, ""); // Elimina espacios y puntuación

        const firmaArtista = limpiarTexto(data.artista);
        const firmaCancion = limpiarTexto(data.cancion);
        
        // La firma ahora será mucho más corta y exacta: ej. "yeisonjimenezdestinofinal"
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

    // 1. PRIMER CHECK (Súper rápido): Validamos el ID exacto del video por si hacen doble clic
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

    // 2. LLAMADA A IA: Obtenemos el género y los datos limpios para la firma
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
        // 3. TRANSACCIÓN ATÓMICA
        await adminDb.runTransaction(async (transaction) => {
            
            // SEGUNDO CHECK (Inteligente): Buscamos por la FIRMA para evitar el mismo tema en otro video
            const queryDuplicadoInteligente = colaRef
                .where("firma", "==", analisis.firma)
                .where("estado", "==", "pendiente")
                .limit(1);
                
            const duplicadoInteligenteSnap = await transaction.get(queryDuplicadoInteligente);
            
            if (!duplicadoInteligenteSnap.empty) {
                throw new Error("DUPLICADO_FIRMA"); 
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

            // Guardamos todo en Firestore
            transaction.update(mesaRef, {
                creditosDisponibles: nuevosCreditos,
                ...(seAgotaronAhora ? { ventanaInicio: Timestamp.now() } : {}),
            });

            const nuevaCancionRef = colaRef.doc();
            transaction.set(nuevaCancionRef, {
                titulo: analisis.cancionLimpia,  // Guardamos el título limpio (UX mejorada)
                artista: analisis.artistaLimpio, // Guardamos el artista limpio
                genero: analisis.genero,
                youtubeVideoId: videoId,
                mesaId: String(numeroMesa),
                estado: "pendiente",
                creadaEn: FieldValue.serverTimestamp(),
                firma: analisis.firma            // Guardamos la huella para que el próximo check la encuentre
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
        return NextResponse.json(
            { error: error.message || "Error al agregar la canción" },
            { status: 400 }
        );
    }
}
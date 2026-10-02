export interface CancionPendiente {
    id: string;
    titulo: string;
    genero: string;
    creadaEn: number; // timestamp en milisegundos, para ordenar por llegada
}

// Orden armónico: de más calmado a más enérgico
const ORDEN_GENEROS = [
    "Balada Romántica",
    "Bachata",
    "Vallenato",
    "Merengue",
    "Salsa",
    "Banda",
    "Popular / Despecho",
    "Champeta",
    "Reguetón",
    "Crossover / Mix",
];

const TAMANO_BLOQUE = 5;

export function construirOrdenReproduccion(
    canciones: CancionPendiente[]
): CancionPendiente[] {
    // 1. Agrupa las canciones por género, respetando el orden de llegada (FIFO) dentro de cada género
    const porGenero = new Map<string, CancionPendiente[]>();

    for (const genero of ORDEN_GENEROS) {
        porGenero.set(genero, []);
    }

    for (const cancion of canciones) {
        const lista = porGenero.get(cancion.genero);
        if (lista) {
            lista.push(cancion);
        }
    }

    for (const lista of porGenero.values()) {
        lista.sort((a, b) => a.creadaEn - b.creadaEn);
    }

    // 2. Recorre el ciclo de géneros una y otra vez, tomando bloques de 5,
    //    hasta que todas las listas queden vacías
    const resultado: CancionPendiente[] = [];
    let quedanCanciones = true;

    while (quedanCanciones) {
        quedanCanciones = false;

        for (const genero of ORDEN_GENEROS) {
            const lista = porGenero.get(genero)!;
            if (lista.length === 0) continue; // salta géneros sin canciones pendientes

            const bloque = lista.splice(0, TAMANO_BLOQUE);
            resultado.push(...bloque);
            quedanCanciones = true; // si sacamos algo, hay que seguir revisando la siguiente vuelta
        }
    }

    return resultado;
}
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const busqueda = request.nextUrl.searchParams.get("q");

    if (!busqueda || !busqueda.trim()) {
        return NextResponse.json(
            { error: "Falta el parámetro de búsqueda" },
            { status: 400 }
        );
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    
    // Mejoramos la URL agregando videoEmbeddable=true y videoSyndicated=true
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&maxResults=8&q=${encodeURIComponent(
        busqueda
    )}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
        return NextResponse.json(
            { error: "Error al consultar YouTube" },
            { status: 502 }
        );
    }

    const videos = data.items.map((item: any) => ({
        id: item.id.videoId,
        titulo: item.snippet.title,
        canal: item.snippet.channelTitle,
        miniatura: item.snippet.thumbnails.medium.url,
    }));

    return NextResponse.json({ videos });
}
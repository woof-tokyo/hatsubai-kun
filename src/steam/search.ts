import { steamGet } from "./client.js";

export interface GameHit {
  appid: number;
  name: string;
  price?: string;
}

/** 名前で Steam ストアを検索し、候補（AppID）を返す。 */
export async function searchGames(term: string, limit = 10): Promise<GameHit[]> {
  const data = await steamGet("/api/storesearch/", { term });
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return items.slice(0, limit).map((i) => ({
    appid: Number(i.id),
    name: String(i.name),
    price:
      i?.price?.final != null
        ? `¥${Math.round(Number(i.price.final) / 100)}`
        : undefined,
  }));
}

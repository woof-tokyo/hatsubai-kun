import { steamGet } from "./client.js";

export interface GameDetails {
  appid: number;
  name: string;
  short_description: string;
  price: string;
  release_date?: string;
  genres: string[];
  categories: string[];
  developers: string[];
  publishers: string[];
  /** カバー画像（ストアヘッダー）URL。 */
  header_image?: string;
  /** スクリーンショットURL（フル解像度）。 */
  screenshots: string[];
  /** トレーラー動画URL（Steam配信のmp4。無ければ undefined）。 */
  trailer_url?: string;
}

/** AppID からストア詳細（メタ情報＋画像・スクショ・動画）を取得する。 */
export async function getDetails(appid: number): Promise<GameDetails> {
  const data = await steamGet("/api/appdetails", { appids: appid });
  const entry = data?.[String(appid)];
  if (!entry?.success || !entry.data) {
    throw new Error(`appdetails が取得できませんでした (appid=${appid})`);
  }
  const d = entry.data;
  const screenshots = (d.screenshots ?? [])
    .map((s: any) => String(s.path_full ?? s.path_thumbnail ?? ""))
    .filter(Boolean);
  // movies: 旧形式(mp4/webm)優先、無ければ新形式のHLS(m3u8)/DASH。https化して返す。
  const movie = (d.movies ?? [])[0];
  const rawTrailer =
    movie?.mp4?.max ??
    movie?.mp4?.["480"] ??
    movie?.webm?.max ??
    movie?.hls_h264 ??
    movie?.dash_h264;
  const trailer_url = rawTrailer
    ? String(rawTrailer).replace(/^http:/, "https:")
    : undefined;
  return {
    appid,
    name: String(d.name ?? ""),
    short_description: String(d.short_description ?? ""),
    price: d.price_overview?.final_formatted ?? (d.is_free ? "無料" : "—"),
    release_date: d.release_date?.date,
    genres: (d.genres ?? []).map((g: any) => String(g.description)),
    categories: (d.categories ?? []).map((c: any) => String(c.description)),
    developers: (d.developers ?? []).map(String),
    publishers: (d.publishers ?? []).map(String),
    header_image: d.header_image ? String(d.header_image) : undefined,
    screenshots,
    trailer_url,
  };
}

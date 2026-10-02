import type { Api } from "./types";

export type Connection =
  | { kind: "ready"; api: Api; demo: boolean }
  | { kind: "missing" };

/** Chooses the backend: Supabase when configured, or the in-browser demo in dev with `?demo`. */
export async function connect(): Promise<Connection> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
    const { createDemoApi } = await import("./demoApi");
    return { kind: "ready", api: await createDemoApi(), demo: true };
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return { kind: "missing" };
  const { createSupabaseApi } = await import("./supabaseApi");
  return { kind: "ready", api: createSupabaseApi(url, key), demo: false };
}

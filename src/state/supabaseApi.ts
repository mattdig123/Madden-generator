import { createClient } from "@supabase/supabase-js";
import type { Api, DraftRow, LeagueData, LeagueRow, MemberRow, PickRow } from "./types";

const TABLES = ["league", "members", "drafts", "picks"] as const;

export function createSupabaseApi(url: string, anonKey: string): Api {
  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

  const fail = (error: { message: string } | null): void => {
    if (error) throw new Error(error.message);
  };

  return {
    async loadLeague(): Promise<LeagueData> {
      const [league, members, drafts] = await Promise.all([
        supabase.from("league").select("name, rules, roster").maybeSingle(),
        supabase.from("members").select("id, name, team, joined_at").order("join_order"),
        supabase.from("drafts").select("*").order("created_at", { ascending: false }),
      ]);
      fail(league.error); fail(members.error); fail(drafts.error);
      return {
        league: (league.data as LeagueRow | null) ?? null,
        members: (members.data ?? []) as MemberRow[],
        drafts: (drafts.data ?? []) as DraftRow[],
      };
    },

    async loadPicks(draftId: string): Promise<PickRow[]> {
      const { data, error } = await supabase
        .from("picks").select("draft_id, player, round, player_taken").eq("draft_id", draftId);
      fail(error);
      return (data ?? []) as PickRow[];
    },

    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await supabase.rpc(name, args);
      fail(error);
      return data as T;
    },

    subscribe(onChange: () => void): () => void {
      let channel = supabase.channel("league-changes");
      for (const table of TABLES) {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
      }
      channel.subscribe();
      return () => { void supabase.removeChannel(channel); };
    },
  };
}

import "server-only";
import { sql } from "@/lib/db";

// ---------------------------------------------------------------------------
// Curriculum: course levels, weekends and their videos
// ---------------------------------------------------------------------------
export type LevelRow = { level: 1 | 2; title: string; promise: string | null; outcomes: string | null };

export type VideoRow = {
  id: number;
  weekend_id: number;
  title: string;
  url: string;
  kind: "topic" | "hands_on" | "extra";
  sort_order: number;
};

export type WeekendRow = {
  id: number;
  level: 1 | 2;
  weekend_no: number;
  title: string;
  ng_skill: string | null;
  tag: string | null;
  topics: string | null;
  you_build: string | null;
  homework: string | null;
  slides: string | null;
  videos: VideoRow[];
};

export type Curriculum = { levels: LevelRow[]; weekends: WeekendRow[] };

/** Both levels with every weekend and its videos (admin + student). */
export async function loadCurriculum(): Promise<Curriculum> {
  const [levels, weekends, videos] = await Promise.all([
    sql`SELECT level, title, promise, outcomes FROM course_levels ORDER BY level` as unknown as Promise<LevelRow[]>,
    sql`
      SELECT id, level, weekend_no, title, ng_skill, tag, topics, you_build, homework, slides
      FROM weekends ORDER BY level, weekend_no
    ` as unknown as Promise<Omit<WeekendRow, "videos">[]>,
    sql`
      SELECT id, weekend_id, title, url, kind, sort_order
      FROM weekend_videos ORDER BY sort_order, id
    ` as unknown as Promise<VideoRow[]>,
  ]);
  return {
    levels: levels.map((l) => ({ ...l, level: Number(l.level) as 1 | 2 })),
    weekends: weekends.map((w) => ({
      ...w,
      level: Number(w.level) as 1 | 2,
      videos: videos.filter((v) => v.weekend_id === w.id),
    })),
  };
}

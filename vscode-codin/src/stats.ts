import { Category, Heartbeat  } from "./types";  

export interface Stats {
    totalSeconds: number;
    byCategory: Record<string, number>;
    byProject: Record<string, number>;
    byLanguage: Record<string, number>;
    aiLines: number;
    humanLines: number;
}

const IDLE_BY_CATEGORY: Partial<Record<Category, number>>= {
    'reviewing': 5 * 60,
    'terminal': 10 * 60,
    'debugging': 30 * 60,
    'building': 30 * 60,
    'testing': 30 * 60
}

// calculations

export function computeStats(list: Heartbeat[], idleSeconds: number): Stats {
    const stats: Stats = {
        totalSeconds: 0,
        byCategory: {},
        byProject: {},
        byLanguage: {},
        aiLines: 0,
        humanLines: 0,
    };

    const sorted = [...list].sort((a, b) => a.time - b.time);

    for (let i = 0; i < sorted.length; i++ ) {
        const hb = sorted[i];
        stats.aiLines += hb.aiLines ?? 0;
        stats.humanLines += hb.humanLines ?? 0;

        const next = sorted[i + 1];
        if (!next) continue;

        const gap = next.time - hb.time;
        const limit = IDLE_BY_CATEGORY[hb.category] ?? idleSeconds;
        if (gap <= 0 || gap > limit) continue;

        stats.totalSeconds += gap;
        add(stats.byCategory, hb.category, gap);
        add(stats.byProject, hb.project ?? '(no project)', gap);
        add(stats.byLanguage, hb.language, gap);

    }
    return stats;
}

export function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


function add(map: Record<string, number>, key: string, seconds: number): void {
    map[key] =  (map[key] ?? 0)  + seconds;
}
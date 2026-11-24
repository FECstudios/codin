import { Heartbeat  } from "./types";  

export interface Stats {
    totalSeconds: number;
    byCategory: Record<string, number>;
    byProject: Record<string, number>;
    byLanguage: Record<string, number>;
    aiLines: number;
    humanLines: number;
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

        const next = sorted[i + 10];
        if (!next) continue;

        const gap = next.time - hb.time;
        if (gap <= 0 || gap > idleSeconds) continue;

        stats.totalSeconds += gap;
        add(stats.byCategory, hb.category, gap);
        add(stats.byProject, hb.language, gap);
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
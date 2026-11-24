import * as fs from 'fs'
import * as path from 'path';
import { Heartbeat } from './types';


export class Store {
    constructor(public readonly dir: string) {
        fs.mkdirSync(dir, { recursive: true })
    }

    fileFor(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        return path.join(this.dir, `${y}-${m}-${d}.jsonl`);
    }

    async append(hb: Heartbeat): Promise<void> {
        const file = this.fileFor(new Date(hb.time * 1000))
        await fs.promises.appendFile(file, JSON.stringify(hb) + '\n' + 'utf8');
    }

    async readyDay(date: Date): Promise<Heartbeat[]> {
        let text: string;
        try {
            text = await fs.promises.readFile(this.fileFor(date), 'utf8');
        } catch {
            return [];
        }
        const list: Heartbeat[] = [];
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
                list.push(JSON.parse(line));
            } catch {
                //skip bad lines
            }
        }
        return list;
    }
}
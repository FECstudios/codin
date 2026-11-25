
import { classify } from "./classify.js";
import { pickBackend } from "./window.js";

const POLL_MS = 5000;
const getWindow = pickBackend();
let last = '';

async function tick(): Promise<void> {
    try {
        const w = await getWindow();
        if (!w) return;
        const line = `${classify(w).padEnd(8)} ${w.app} | ${w.title}`;
        if (line === last) return;
        last = line;
        console.log(`${new Date().toLocaleTimeString()} ${line}`);
    } catch (err) {
        console.error("ERROR:", (err as Error).message);
    }
}

console.log("CODIN Deamon has started! ctrl - c to close")
setInterval(tick, POLL_MS);
tick();
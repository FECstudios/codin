import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
// hyprland
async function fromHyprland() {
    const { stdout } = await run('hyprctl', ['activewindow', '-j']);
    const w = JSON.parse(stdout);
    if (!w.class)
        return undefined;
    return { app: w.class, title: w.title ?? '' };
}
// kde wayland (the true way)
async function fromKde() {
    const app = (await run('kdotool', ['getactivewindow', 'getwindowclassname'])).stdout.trim();
    const title = (await run('kdotool', ['getactivewindow', 'getwindowname'])).stdout.trim();
    if (!app)
        return undefined;
    return { app, title };
}
//windows (eww) and macos, x11
async function fromGetWindows() {
    const { activeWindow } = await import('get-windows');
    const w = await activeWindow();
    if (!w)
        return undefined;
    return { app: w.owner.name, title: w.title, url: 'url' in w ? w.url : undefined };
}
export function pickBackend() {
    const env = process.env;
    if (env.HYPRLAND_INSTANCE_SIGNATURE)
        return fromHyprland;
    if (env.XDG_SESSION_TYPE === 'wayland' && env.XDG_CURRENT_DESKTOP?.includes('KDE'))
        return fromKde;
    return fromGetWindows;
}

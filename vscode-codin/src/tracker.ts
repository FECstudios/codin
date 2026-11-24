import * as vscode from 'vscode'
import { AIDetector, lineDelta } from './ai'
import { Store } from './store';
import { Category, Heartbeat } from './types';

const INTERVAL_MS = 2 * 60 * 1000;
const TRACKED = [ 'file', 'untitled', 'vscode-remote' ];


export class Tracker implements vscode.Disposable {
    private ai = new AIDetector();
    private subs: vscode.Disposable[] = [];
    private timer?: NodeJS.Timeout;

    private debugging = false;
    private tasks = 0;
    private last = { file: '', category: '', time: 0};

    private lines = new Map<string, { ai: number; human: number }>();

    constructor(
        private store: Store,
        private log: vscode.OutputChannel,
        private onSaved: () => void,
    ) {}

    start(): void {
        this.subs.push(
            vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.kind === vscode.TextEditorSelectionChangeKind.Command) return;
                this.schedule(false);
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.ai.reset();
                this.schedule(false);
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                this.ai.reset();
                this.schedule(true);
            }),
            vscode.debug.onDidStartDebugSession(() => {
                this.debugging = true;
                this.schedule(false);
            }),
            vscode.debug.onDidTerminateDebugSession(() => {
                this.debugging = vscode.debug.activeDebugSession !== undefined;
                this.schedule(false);
            }),
            vscode.tasks.onDidStartTask((e) => {
                if (e.execution.task.isBackground) return;
                this.tasks++;
                this.schedule(false);
            }),
            vscode.tasks.onDidEndTask((e) => {
                if (e.execution.task.isBackground) return;
                this.tasks = Math.max(0, this.tasks - 1);
                this.schedule(false);
            }),
        );
    }

    stop(): void {
        clearTimeout(this.timer);
        this.subs.forEach((s) => s.dispose());
        this.subs = [];
    }

    dispose(): void {
        this.stop();
    }
    
    private onChange(e: vscode.TextDocumentChangeEvent): void {
        const kind = this.ai.classify(e);

        if(TRACKED.includes(e.document.uri.scheme)) {
            const delta = lineDelta(e);
            if (delta !== 0) {
                const key = e.document.fileName;
                const counts = this.lines.get(key) ?? { ai: 0, human: 0 };
                if (kind === 'ai') counts.ai += delta;
                else if (Math.abs(delta) <= 50) counts.human += delta;
                this.lines.set(key, counts)
            }
        }

        if (kind === 'ai') this.schedule(false)
    }

    private category(): Category {
        if (this.debugging) return 'debugging';
        if (this.tasks > 0) return 'building';
        if (this.ai.active) return 'ai coding';
        return 'coding';
    }

    private schedule(isWrite: boolean): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.record(isWrite).catch((err: any) => this.log.appendLine(`ERROR: ${err}`));
        }, 50);
    }

    private async record(isWrite: boolean): Promise<void> {
        const doc = vscode.window.activeTextEditor?.document;
        if (!doc || !TRACKED.includes(doc.uri.scheme)) return;

        const file = doc.fileName;
        const category = this.category();
        const now = Date.now();

        const changed= file !== this.last.file || category !== this.last.category;
        if (!isWrite && !changed && now - this.last.time < INTERVAL_MS) return;

        const hb: Heartbeat = {
            time: Math.round(now / 1000),
            file,
            category,
            isWrite,
            language: doc.languageId,
            project: vscode.workspace.getWorkspaceFolder(doc.uri)?.name,
        };

        const counts = this.lines.get(file);
        if (counts) {
            if (counts.ai) hb.aiLines = counts.ai;
            if (counts.human) hb.humanLines = counts.human;
            this.lines.delete(file);
        }

        this.last = { file, category, time: now };
        await this.store.append(hb);
        this.log.appendLine(JSON.stringify(hb));
        this.onSaved();
    }
}
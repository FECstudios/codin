import * as path from 'path';
import * as vscode from 'vscode'
import { AIDetector, lineDelta } from './ai'
import { Store } from './store';
import { Category, Heartbeat } from './types';

const REVIEW_AFTER_MS = 2 * 60 * 1000
const INTERVAL_MS = 2 * 60 * 1000;
const TRACKED = [ 'file', 'untitled', 'vscode-remote' ];
const IGNORED_DIRS = ['.git', 'node_modules', 'out', 'dist', 'build', '.vscode-test'];

const AGENT_CLIS = ['claude', 'codex', 'gemini', 'aider', 'opencode', 'goose', 'amp', 'crush'];
const LONG_CMD = /\b(watch|dev|serve|start)\b/; // servers / watchers run forever
const TEST_CMD = /\b(test|tests|jest|vitest|mocha|pytest)\b/;
const BUILD_CMD = /\b(build|compile|tsc|make|webpack|gradle|mvn)\b/;

const PULSE_MS = 60 * 1000;
const BUSY_IDLE_MS = 30 * 60 * 1000;

type Shell = { terminal: vscode.Terminal; kind: Category };

export class Tracker implements vscode.Disposable {
    private ai = new AIDetector();
    private subs: vscode.Disposable[] = [];
    private timer?: NodeJS.Timeout;

    private debugging = false;
    private tasks = 0;
    private lastEdit = 0;
    private lastEditor = 0;
    private tests = 0;
    private lastShell = 0;
    private pulse?: NodeJS.Timeout;

    private shells = new Map<vscode.TerminalShellExecution, Shell>();
    private last = { file: '', category: '', time: 0};

    private lines = new Map<string, { ai: number; human: number }>();

    constructor(
        private store: Store,
        private log: vscode.OutputChannel,
        private onSaved: () => void,
    ) {}

    start(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*')
        this.subs.push(
            watcher,
            watcher.onDidChange((uri) => this.onDiskChange(uri)),
            watcher.onDidCreate((uri) => this.onDiskChange(uri)),
            vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.kind === vscode.TextEditorSelectionChangeKind.Command) return;
                this.lastEditor = Date.now();
                this.schedule(false);
            }),
            vscode.window.onDidChangeTextEditorVisibleRanges(() => {
                this.lastEditor = Date.now();
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
                if (isTestTask(e.execution.task)) this.tests++;
                else this.tasks++;
                this.schedule(false);
            }),
            vscode.tasks.onDidEndTask((e) => {
                if (e.execution.task.isBackground) return;
                if (isTestTask(e.execution.task)) this.tests = Math.max(0, this.tests - 1);
                else this.tasks = Math.max(0, this.tasks - 1);
                this.schedule(false);
            }),
            vscode.window.onDidStartTerminalShellExecution((e) => {
                const kind = classifyCommand(e.execution.commandLine.value);
                this.shells.set(e.execution, { terminal: e.terminal, kind });
                this.lastShell = Date.now();
                this.onShellsChanged();
            }),
            vscode.window.onDidEndTerminalShellExecution((e) => {
                this.shells.delete(e.execution);
                this.onShellsChanged();
            }),
            vscode.window.onDidCloseTerminal((terminal) => {
                for (const [exec, s] of this.shells) {
                    if (s.terminal === terminal) this.shells.delete(exec);
                }
                this.onShellsChanged();
            }),
        );

        this.pulse = setInterval(() => {
            const busy = [ 'debugging', 'building', 'testing' ].includes(this.category());
            const idleFor = Date.now() - Math.max(this.lastEditor, this.lastShell);
            if (busy && idleFor < BUSY_IDLE_MS) this.schedule(false);
        })
    }

    stop(): void {
        clearTimeout(this.timer);
        clearInterval(this.pulse);
        this.subs.forEach((s) => s.dispose());
        this.subs = [];
    }

    dispose(): void {
        this.stop();
    }
    
    private onChange(e: vscode.TextDocumentChangeEvent): void {
        const kind = this.ai.classify(e);

        const isActiveDoc = e.document === vscode.window.activeTextEditor?.document;
        if (kind !== 'ai' && isActiveDoc && e.contentChanges.length > 0) this.lastEdit = Date.now();
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

    private onShellsChanged(): void {
        this.ai.agentRunning = [...this.shells.values()].some((s) => s.kind === 'ai coding')
        this.schedule(false);
    }

    private onDiskChange(uri: vscode.Uri): void {
        if (IGNORED_DIRS.some((dir) => uri.path.includes(`/${dir}/`))) return;

        const key = uri.toString();
        const isOpen = vscode.workspace.textDocuments.some((d) => d.uri.toString() == key);
        if(isOpen) return;

        if(vscode.window.state.focused && !this.ai.agentRunning) return;

        this.ai.active = true;
        this.schedule(false);
    }

    
    private category(): Category {
        const running = [...this.shells.values()].map((s) => s.kind);
        if (this.debugging) return 'debugging';
        if (this.tests > 0 || running.includes('testing')) return 'testing';
        if (this.tasks > 0 || running.includes('building')) return 'building';
        if (this.ai.active || this.ai.agentRunning) return 'ai coding';
        if (this.lastShell > this.lastEditor) return 'terminal'
        if(Date.now() - this.lastEdit > REVIEW_AFTER_MS) return 'reviewing';
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
        const category = this.category();
        const now = Date.now();

        const inEditor = doc !== undefined && TRACKED.includes(doc.uri.scheme);
        if (!inEditor && (category === 'coding' || category === 'reviewing')) return;
        const file = inEditor ? doc.fileName : '(terminal)';
        const changed= file !== this.last.file || category !== this.last.category;
        if (!isWrite && !changed && now - this.last.time < INTERVAL_MS) return;

        const hb: Heartbeat = {
            time: Math.round(now / 1000),
            file,
            category,
            isWrite,
            language: inEditor ? doc.languageId : 'shell',
            project: inEditor
                ? vscode.workspace.getWorkspaceFolder(doc.uri)?.name
                : vscode.workspace.workspaceFolders?.[0]?.name,
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

function classifyCommand(cmd: string): Category {
    const first = path.basename(cmd.trim().split(/\s+/)[0] ?? '');
    if (AGENT_CLIS.includes(first)) return 'ai coding';
    if (LONG_CMD.test(cmd)) return 'terminal';
    if (TEST_CMD.test(cmd)) return 'testing';
    if (BUILD_CMD.test(cmd)) return 'building';
    return 'terminal';
}

function isTestTask(task: vscode.Task): boolean {
    return task.group?.id === vscode.TaskGroup.Test.id || /test/i.test(task.name)
}
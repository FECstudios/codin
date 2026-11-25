import * as vscode from 'vscode';

const AI_EXTENSIONS = [
    'github.copilot',
    'github.copilot-chat',
    'anthropic.claude-code',
    'openai.chatgpt',
    'codeium.codeium',
    'continue.continue',
    'saoudrizwan.claude-dev',
]

const AI_SCHEMES = ['vscode-chat-code-block', 'openai-codex'];

const AI_TABS = ['claude', 'chatgpt', 'codex', 'copilot', 'cline'];

export type EditKind = 'ai' | 'human' | 'other';

export class AIDetector {
    active = false;
    agentRunning = false;
    private bigInserts: number[] = [];
    private keystrokes: number[] = [];

    reset(): void {
        this.active = false;
        this.bigInserts = [];
        this.keystrokes = [];
    }

    hasAIExtention(): boolean {
        return AI_EXTENSIONS.some((id) => vscode.extensions.getExtension(id)?.isActive);
    }

    isAITabFocused(): boolean {
        const input = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
        if (!(input instanceof vscode.TabInputWebview)) return false;
        const  viewType = input.viewType.toLowerCase();
        return AI_TABS.some((name) => viewType.includes(name));
    }

    isExternal(e: vscode.TextDocumentChangeEvent): boolean {
        if (e.document.uri.scheme !== 'file') return false;
        if (e.reason !== undefined) return false;
        return !vscode.window.state.focused;
    }

    classify(e: vscode.TextDocumentChangeEvent): EditKind {
        const now = Date.now();

        if(AI_SCHEMES.includes(e.document.uri.scheme) || this.isAITabFocused()) {
            this.active = true;
            return 'ai';
        }
        if (e.contentChanges.length === 0) return 'other';

        if (this.isExternal(e)) {
            this.active = true;
            return 'ai';
        }

        if(isKeystroke(e)) {
            this.keystrokes = this.keystrokes.filter((t) => now - t < 1500);
            this.keystrokes.push(now);
            if (this.keystrokes.length >= 2) this.reset();
            return 'human';
        }
        
        if(!isBigInserts(e)) return this.active ? 'ai' : 'other';

        const aiInstalled = this.hasAIExtention() || this.agentRunning;
        const focused = vscode.window.activeTextEditor?.document === e.document;

        if(aiInstalled && !focused) {
            this.active = true;
            return 'ai'
        }

        this.bigInserts = this.bigInserts.filter((t) => now - t < 1000);
        this.bigInserts.push(now);
        if (aiInstalled && this.bigInserts.length >= 3) this.active = true

        return this.active ? 'ai' : 'other';

    }
}
function isKeystroke(e: vscode.TextDocumentChangeEvent): boolean {
    if (e.contentChanges.length !== 1) return false;
    const c = e.contentChanges[0];
    if (c.text === '' && c.rangeLength <= 1) return true;
    return c.text.length === 1 && c.text !== '\n';
}

function isBigInserts(e: vscode.TextDocumentChangeEvent): boolean {
    const text = e.contentChanges.map((c) => c.text).join('');
    const newlines = (text.match(/\n/g) ?? []).length;
    return newlines >= 3 || text.trim().length > 50;
}

export function lineDelta(e: vscode.TextDocumentChangeEvent): number {
    let delta = 0;
    for (const c of e.contentChanges) {
        const added = (c.text.match(/\n/g) ?? []).length;
        const removed = c.range.end.line - c.range.start.line;
        delta += added - removed;
    }
    return delta
}
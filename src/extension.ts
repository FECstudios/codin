// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { Store } from './store'
import { Tracker } from './tracker'
import { computeStats, formatDuration, Stats } from './stats'


const IDLE_SECONDS = 15 * 60

export function activate(context: vscode.ExtensionContext) {
    const log = vscode.window.createOutputChannel('Codin');
    const store = new Store(path.join(os.homedir(), '.codin'));

	// status bar clock
	const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	bar.command = 'vscode-codin.stats';
	bar.show();

	const refresh = async () => {
		const stats = computeStats(await store.readyDay(new Date()), IDLE_SECONDS);
		const ai = stats.byCategory['ai coding'] ?? 0;
		bar.text = `$(clock) ${formatDuration(stats.totalSeconds)}`;
		bar.tooltip = `Today ${formatDuration(stats.totalSeconds)} (AI: ${formatDuration(ai)})`; 
	};

	const tracker = new Tracker(store, log, refresh);
	tracker.start();

	const interval = setInterval(refresh, 60 * 1000);
	refresh()

	context.subscriptions.push(
		log,
		bar,
		tracker,
		{dispose: () => clearInterval(interval) },
		vscode.commands.registerCommand('vscode-codin.stats', async () => {
			const stats = computeStats(await store.readyDay(new Date()), IDLE_SECONDS);
			const doc = await vscode.workspace.openTextDocument({
				language: 'markdown',
				content: report(stats),
			});
			await vscode.window.showTextDocument(doc);
		}),

		vscode.commands.registerCommand('vscode-codin.openFolder', () => {
			vscode.env.openExternal(vscode.Uri.file(store.dir));
		}),

		vscode.commands.registerCommand('vscode-codin.showLog', () => log.show()),
	);

	log.appendLine(`Tracking has started, values: ${store.dir}`);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function report(s: Stats): string {
	const lines = [
		`# Codin ${new Date().toString()}`,
		``,
		`Total: ${formatDuration(s.totalSeconds)}`,
		`Lines: ${s.humanLines} human, ${s.aiLines} AI written`,
		``,
	]

	const sections: [string, Record<string, number>] [] = [
		['Category', s.byCategory],
		['Project', s.byProject],
		['Language', s.byLanguage],
	];

	for (const [title, map] of sections) {
		lines.push(`## ${title}`);
		const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
		for (const [name, secs] of sorted) {
			lines.push(`- ${name}: ${formatDuration(secs)}`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

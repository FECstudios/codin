export type Category = 'coding' | 'ai coding' | 'debugging'  | 'reviewing' | 'building' | 'testing' | 'terminal';

export interface Heartbeat {
    time: number;
    file: string;
    category: Category;
    isWrite: boolean;
    language: string;
    project?: string;
    aiLines?: number;
    humanLines?: number;
}
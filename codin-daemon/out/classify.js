const EDITORS = /^(code|code-oss|vscodium|cursor|zed|kate|nvim|jetbrains|idea)/i;
const RULES = [
    ['ai', /claude\.ai|claude|chatgpt|gemini\.google|perplexity/i],
    ['testing', /localhost|127\.0\.0\.1/i],
    ['docs', /stack ?overflow|developer\.mozilla|mdn|devdocs|docs|documentation/i],
];
export function classify(w) {
    if (EDITORS.test(w.app))
        return 'code';
    const text = w.url ?? w.title;
    for (const [category, pattern] of RULES) {
        if (pattern.test(text))
            return category;
    }
    return 'other';
}
export const IDLE_SECONDS = {
    code: 2 * 60,
    testing: 3 * 60,
    docs: 5 * 60,
    ai: 5 * 60,
    other: 2 * 60,
};

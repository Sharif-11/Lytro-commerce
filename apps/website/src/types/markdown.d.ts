// A Markdown file imported as its text (next.config.ts's `asset/source` rule; vitest.config.ts does the same).
declare module '*.md' {
  const text: string;
  export default text;
}

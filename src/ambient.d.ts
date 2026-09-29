// Plain side-effect stylesheet imports (the page entries); TypeScript 6 checks that they resolve.
declare module '*.css' {}

declare module '*.css?inline' {
  const css: string;
  export default css;
}

declare module '*.svg' {
  const url: string;
  export default url;
}

declare module '*.svg?raw' {
  const raw: string;
  export default raw;
}

declare module '*?raw' {
  const raw: string;
  export default raw;
}

declare module '*.png' {
  const url: string;
  export default url;
}

// Vite inlines this as a literal, so a normal build drops every guarded block and ships no test surface.
declare const __EGA_E2E_HOOKS__: boolean;

// True only under Vitest, where jsdom cannot create a trusted event; every real build, e2e included, inlines false.
declare const __EGA_UNIT_TESTS__: boolean;

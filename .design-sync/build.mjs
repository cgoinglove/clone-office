// Builds the package the design-sync converter reads, from the app's own source: an entry that
// re-exports the shared UI and the office, the .d.ts tree tsc emits for them, and one stylesheet
// (the app's Tailwind theme compiled, the office's sketch, the Geist faces the app uses).
// Output goes to .design-sync/.cache/pkg, which is gitignored. Run from the repo root:
//   node .design-sync/build.mjs

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PKG = join(ROOT, ".design-sync/.cache/pkg");
const DIST = join(PKG, "dist");
const posix = (p) => p.split("\\").join("/");

// What the design system is: every shared UI part except the ones with nothing to draw
// (theme-sync, notify's imperative dialogs) and the markdown pair, whose renderer pulls in
// mermaid, KaTeX and Shiki; then the office.
const SKIP = new Set(["markdown", "markdown-body", "theme-sync", "notify"]);
const ui = readdirSync(join(ROOT, "components/ui"))
  .filter((f) => f.endsWith(".tsx") && !SKIP.has(f.replace(/\.tsx$/, "")))
  .sort()
  .map((f) => `components/ui/${f}`);
const MODULES = [...ui, "features/office/index.ts"];

rmSync(PKG, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(
  join(PKG, "package.json"),
  `${JSON.stringify({ name: "sub-office", version: "0.1.0", private: true, type: "module", module: "dist/index.js", types: "dist/index.d.ts" }, null, 2)}\n`,
);

// 1. the entry: the source itself, which the converter bundles with the app's tsconfig paths
const noExt = (p) => p.replace(/\.(tsx?|mts)$/, "");
writeFileSync(
  join(DIST, "index.js"),
  `${MODULES.map((m) => `export * from ${JSON.stringify(posix(relative(DIST, join(ROOT, m))))};`).join("\n")}\n`,
);

// 2. types: tsc's declarations for those modules, with the app's `@/` paths made relative
const tsconfig = join(PKG, "tsconfig.dts.json");
writeFileSync(
  tsconfig,
  JSON.stringify({
    extends: posix(relative(PKG, join(ROOT, "tsconfig.json"))),
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      incremental: false,
      rootDir: posix(relative(PKG, ROOT)),
      outDir: "dist",
      plugins: [],
    },
    include: [],
    files: MODULES.map((m) => posix(relative(PKG, join(ROOT, m)))),
  }),
);
execFileSync(join(ROOT, "node_modules/.bin/tsc"), ["-p", tsconfig], {
  cwd: ROOT,
  stdio: "inherit",
});
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
for (const file of walk(DIST).filter((f) => f.endsWith(".d.ts"))) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(
    /(from\s+|import\()(["'])@\/([^"']+)\2/g,
    (_, lead, q, target) => {
      let rel = posix(relative(dirname(file), join(DIST, target)));
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return `${lead}${q}${rel}${q}`;
    },
  );
  if (out !== src) writeFileSync(file, out);
}
writeFileSync(
  join(DIST, "index.d.ts"),
  `${MODULES.map((m) => `export * from ${JSON.stringify(`./${noExt(m)}`)};`).join("\n")}\n`,
);

// 3. styles: the Geist faces (next/font loads them in the app), the Tailwind theme compiled
// against the app's sources, then the office's sketch
const require = createRequire(join(ROOT, "package.json"));
const tailwind = require("@tailwindcss/postcss");
// postcss itself is the plugin's dependency, not the app's
const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
  "postcss",
);
const globals = join(ROOT, "app/globals.css");
// The app ships only the utilities its own sources use; a design built on this system
// writes its own layout, so the everyday ones come along too, with the theme's colours.
const COLORS =
  "background,foreground,card,card-foreground,popover,popover-foreground,primary,primary-foreground,secondary,secondary-foreground,muted,muted-foreground,accent,accent-foreground,brand,brand-foreground,destructive,waiting,border,input,ring";
const STEPS = "0,0.5,1,1.5,2,2.5,3,3.5,4,5,6,7,8,9,10,11,12,14,16,20,24";
const SAFELIST = [
  "{block,inline-block,inline,flex,inline-flex,grid,inline-grid,hidden,contents}",
  "{flex-row,flex-col,flex-wrap,flex-1,flex-none,shrink-0,grow,items-start,items-center,items-end,items-stretch,items-baseline,justify-start,justify-center,justify-end,justify-between,justify-around,self-start,self-center,self-end,place-items-center,content-start}",
  `{gap,gap-x,gap-y,p,px,py,pt,pb,pl,pr,m,mx,my,mt,mb,ml,mr,space-x,space-y}-{${STEPS}}`,
  "{mx,ml,mr,my,mt,mb}-auto",
  `{w,h,size,min-w,min-h}-{full,fit,auto,screen,${STEPS},28,32,36,40,48,56,64,72,80,96}`,
  "max-w-{xs,sm,md,lg,xl,2xl,3xl,4xl,5xl,6xl,7xl,full,prose}",
  "{grid-cols,col-span}-{1,2,3,4,5,6,12}",
  `{bg,text,border,ring,fill,stroke}-{${COLORS}}`,
  `{bg,text,border}-{${COLORS}}/{5,10,20,50,80}`,
  "text-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,left,center,right}",
  "{font-normal,font-medium,font-semibold,font-bold,font-mono,font-sans,italic,uppercase,tabular-nums,truncate,whitespace-nowrap,break-words,text-balance,text-pretty}",
  "{leading-none,leading-tight,leading-snug,leading-normal,leading-relaxed,tracking-tight,tracking-normal,tracking-wide}",
  "{rounded,rounded-sm,rounded-md,rounded-lg,rounded-xl,rounded-2xl,rounded-3xl,rounded-full,border,border-0,border-2,border-t,border-b,border-l,border-r,ring-1,shadow-xs,shadow-sm,shadow-md,shadow-lg}",
  "{relative,absolute,fixed,sticky,inset-0,top-0,bottom-0,left-0,right-0,z-10,z-20,z-50,overflow-hidden,overflow-auto,overflow-x-auto,overflow-y-auto,opacity-50,opacity-70,cursor-pointer,select-none,aspect-square,aspect-video,object-cover}",
]
  .map((s) => `@source inline("${s}");`)
  .join("\n");
const compiled = await postcss([tailwind({ base: ROOT })]).process(
  `${readFileSync(globals, "utf8")}\n${SAFELIST}\n`,
  {
    from: globals,
  },
);
const fonts = [
  `@import url("https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap");`,
  `:root { --font-geist-sans: "Geist"; --font-geist-mono: "Geist Mono"; }`,
].join("\n");
const office = readFileSync(join(ROOT, "features/office/office.css"), "utf8");
writeFileSync(join(DIST, "styles.css"), `${fonts}\n${compiled.css}\n${office}`);

console.log(`built ${posix(relative(ROOT, PKG))}: ${MODULES.length} modules`);

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");

const BAG_PATH =
  "M170 180 h172 l-22 190 a40 40 0 0 1 -40 36 h-48 a40 40 0 0 1 -40 -36 z";
const HANDLE_PATH = "M206 180 v-24 a50 50 0 0 1 100 0 v24";

const BARCODE_BARS = `
    <g fill="#10b981">
      <rect x="214" y="252" width="14" height="68" rx="4" />
      <rect x="240" y="252" width="8" height="68" rx="3" />
      <rect x="260" y="252" width="14" height="68" rx="4" />
      <rect x="286" y="252" width="8" height="68" rx="3" />
    </g>`;

function buildSvg({ maskable }) {
  const radius = maskable ? 0 : 96;
  const scale = maskable ? 0.62 : 0.78;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#0f172a" />
  <g transform="translate(256 262) scale(${scale}) translate(-256 -262)">
    <g fill="none" stroke="#10b981" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
      <path d="${BAG_PATH}" />
      <path d="${HANDLE_PATH}" />
    </g>
    ${BARCODE_BARS}
  </g>
</svg>
`;
}

async function main() {
  const sharp = (await import("sharp")).default;
  await mkdir(outDir, { recursive: true });

  const any = buildSvg({ maskable: false });
  const maskable = buildSvg({ maskable: true });

  const targets = [
    { name: "icon-192.png", svg: any, size: 192 },
    { name: "icon-512.png", svg: any, size: 512 },
    { name: "maskable-512.png", svg: maskable, size: 512 },
    { name: "apple-touch-icon.png", svg: any, size: 180 },
  ];

  for (const target of targets) {
    await sharp(Buffer.from(target.svg))
      .resize(target.size, target.size)
      .png()
      .toFile(path.join(outDir, target.name));
    console.log(`ok ${target.name} (${target.size}x${target.size})`);
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(outDir, "icon.svg"), any, "utf8");
  console.log("ok icon.svg");
}

main().catch((error) => {
  console.error(
    "Falha ao gerar ícones. sharp precisa estar instalado (npm i -D sharp).",
    error
  );
  process.exitCode = 1;
});

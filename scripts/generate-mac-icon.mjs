import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetsDir = path.join(rootDir, "assets");
const macAssetsDir = path.join(assetsDir, "mac");
const iconsetDir = path.join(macAssetsDir, "AI Creator OS.iconset");

const pngPath = path.join(assetsDir, "icon.png");
const rootIcnsPath = path.join(assetsDir, "icon.icns");
const macIcnsPath = path.join(macAssetsDir, "icon.icns");

const ICONSET_SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

await generateMacIcon();

export async function generateMacIcon() {
  await mkdir(macAssetsDir, { recursive: true });
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  const icon1024 = renderIcon(1024);
  await writeFile(pngPath, encodePng(1024, 1024, icon1024));

  for (const [fileName, size] of ICONSET_SIZES) {
    await writeFile(path.join(iconsetDir, fileName), encodePng(size, size, renderIcon(size)));
  }

  await execFilePromise("iconutil", ["-c", "icns", iconsetDir, "-o", macIcnsPath]);
  await writeFile(rootIcnsPath, await import("node:fs/promises").then(({ readFile }) => readFile(macIcnsPath)));
  console.log(`Generated ${path.relative(rootDir, pngPath)}`);
  console.log(`Generated ${path.relative(rootDir, macIcnsPath)}`);
  console.log(`Generated ${path.relative(rootDir, rootIcnsPath)}`);
  return { pngPath, rootIcnsPath, macIcnsPath };
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const cornerRadius = size * 0.22;
  const coreRadius = size * 0.18;
  const ringRadius = size * 0.31;
  const nodeRadius = Math.max(2, size * 0.028);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const alpha = roundedSquareAlpha(x + 0.5, y + 0.5, size, cornerRadius);
      if (alpha <= 0) continue;

      const nx = x / (size - 1);
      const ny = y / (size - 1);
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy) / center;
      const angle = Math.atan2(dy, dx);

      const bg = mixColor(
        [7, 8, 19],
        [87, 28, 168],
        clamp(0.2 + nx * 0.55 + (1 - ny) * 0.25)
      );
      const glow = Math.max(0, 1 - distance) ** 2;
      const blueGlow = Math.max(0, 1 - Math.hypot(nx - 0.68, ny - 0.32) / 0.42) ** 2;
      let color = addColor(bg, scaleColor([33, 202, 255], 0.45 * blueGlow));
      color = addColor(color, scaleColor([171, 78, 255], 0.34 * glow));

      const ring = Math.abs(Math.hypot(dx, dy) - ringRadius) / Math.max(1, size * 0.018);
      if (ring < 1) color = mixColor(color, [45, 223, 255], (1 - ring) * 0.8);

      const ray = Math.abs(Math.sin(angle * 3 + distance * 4));
      if (ray > 0.985 && distance > 0.2 && distance < 0.82) {
        color = mixColor(color, [117, 87, 255], 0.28);
      }

      color = drawNodes(color, x, y, center, ringRadius, nodeRadius, size);
      color = drawLetterA(color, x, y, center, size);
      color = drawCore(color, dx, dy, coreRadius);

      pixels[index] = clampByte(color[0]);
      pixels[index + 1] = clampByte(color[1]);
      pixels[index + 2] = clampByte(color[2]);
      pixels[index + 3] = clampByte(255 * alpha);
    }
  }
  return pixels;
}

function drawCore(color, dx, dy, radius) {
  const dist = Math.hypot(dx, dy);
  const core = Math.max(0, 1 - dist / radius);
  if (!core) return color;
  return addColor(color, scaleColor([70, 232, 255], 0.52 * core ** 1.7));
}

function drawNodes(color, x, y, center, ringRadius, nodeRadius, size) {
  let next = color;
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    const nodeX = center + Math.cos(angle) * ringRadius;
    const nodeY = center + Math.sin(angle) * ringRadius;
    const dist = Math.hypot(x - nodeX, y - nodeY);
    const node = Math.max(0, 1 - dist / nodeRadius);
    const halo = Math.max(0, 1 - dist / (nodeRadius * 3.8));
    if (halo) next = addColor(next, scaleColor([48, 220, 255], halo * 0.28));
    if (node) next = mixColor(next, index % 2 ? [195, 103, 255] : [58, 231, 255], node);

    const lineDistance = distanceToSegment(x, y, center, center, nodeX, nodeY);
    const line = Math.max(0, 1 - lineDistance / Math.max(1, size * 0.006));
    const along = Math.hypot(x - center, y - center) < ringRadius;
    if (line && along) next = mixColor(next, [44, 205, 255], line * 0.34);
  }
  return next;
}

function drawLetterA(color, x, y, center, size) {
  const top = [center, size * 0.28];
  const left = [size * 0.34, size * 0.72];
  const right = [size * 0.66, size * 0.72];
  const stroke = size * 0.035;
  const leftStroke = Math.max(0, 1 - distanceToSegment(x, y, top[0], top[1], left[0], left[1]) / stroke);
  const rightStroke = Math.max(0, 1 - distanceToSegment(x, y, top[0], top[1], right[0], right[1]) / stroke);
  const crossStroke = Math.max(0, 1 - distanceToSegment(x, y, size * 0.43, size * 0.56, size * 0.57, size * 0.56) / (stroke * 0.78));
  const strokeStrength = Math.max(leftStroke, rightStroke, crossStroke);
  if (!strokeStrength) return color;
  const neon = mixColor([122, 85, 255], [67, 234, 255], strokeStrength);
  return mixColor(color, neon, Math.min(0.92, strokeStrength * 0.86));
}

function roundedSquareAlpha(x, y, size, radius) {
  const half = size / 2;
  const px = Math.abs(x - half) - (half - radius);
  const py = Math.abs(y - half) - (half - radius);
  const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - radius;
  return clamp(0.5 - outside);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / lenSq);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  return buffer;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function mixColor(a, b, t) {
  const n = clamp(t);
  return [
    a[0] * (1 - n) + b[0] * n,
    a[1] * (1 - n) + b[1] * n,
    a[2] * (1 - n) + b[2] * n
  ];
}

function addColor(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleColor(color, scale) {
  return [color[0] * scale, color[1] * scale, color[2] * scale];
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function execFilePromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

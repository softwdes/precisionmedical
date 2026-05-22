import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

mkdirSync('./public/icons', { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svg = readFileSync('./logo.svg');

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(`./public/icons/icon-${size}.png`);
  console.log(`✓ icon-${size}.png`);
}

console.log('All icons generated in public/icons/');

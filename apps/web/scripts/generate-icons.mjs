import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('./public/icons', { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const svgIcon = (size) => {
  const radius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.36);
  const letterSpacing = Math.round(size * 0.025);
  return Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <text
    x="50%" y="52%"
    dominant-baseline="middle"
    text-anchor="middle"
    fill="white"
    font-weight="800"
    font-size="${fontSize}"
    font-family="Arial, Helvetica, sans-serif"
    letter-spacing="${letterSpacing}"
  >LM</text>
</svg>`);
};

for (const size of sizes) {
  await sharp(svgIcon(size))
    .resize(size, size)
    .png()
    .toFile(`./public/icons/icon-${size}.png`);
  console.log(`✓ icon-${size}.png`);
}

console.log('All icons generated in public/icons/');

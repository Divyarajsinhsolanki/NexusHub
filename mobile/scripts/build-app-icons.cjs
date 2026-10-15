// Package the original artwork at exact native icon and splash dimensions.
const path = require('path');
const Jimp = require('jimp-compact');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets/images');
async function main() {
  const source = await Jimp.read(path.join(assets, 'icon-concepts/ds-design-studio-3d-2026-10/ds-design-studio-3d.png'));
  let left = source.bitmap.width, top = source.bitmap.height, right = 0, bottom = 0;
  source.scan(0, 0, source.bitmap.width, source.bitmap.height, function(x, y, index) {
    if (this.bitmap.data[index + 3] < 128) return;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  });
  // Keep antialiased edges, excluding isolated transparent edge noise.
  left = Math.max(0, left - 8); top = Math.max(0, top - 8);
  right = Math.min(source.bitmap.width - 1, right + 8); bottom = Math.min(source.bitmap.height - 1, bottom + 8);
  const artwork = source.clone().crop(left, top, right - left + 1, bottom - top + 1);
  async function canvas(name, size, background) {
    const art = artwork.clone().scaleToFit(size, size, Jimp.RESIZE_BICUBIC);
    const image = new Jimp(1024, 1024, background);
    image.composite(art, Math.round((1024 - art.bitmap.width) / 2), Math.round((1024 - art.bitmap.height) / 2));
    await image.writeAsync(path.join(assets, name));
  }
  await canvas('ds-app-icon-v2.png', 984, '#185878');
  // Larger than the previous 483px artwork, with room for launcher masks.
  await canvas('ds-adaptive-foreground-v2.png', 600, '#00000000');
  // Separate tight artwork: Android scales this to 160dp inside its 288dp canvas.
  await canvas('ds-splash-logo-v2.png', 984, '#00000000');
  console.log('Updated launcher and splash assets from the original artwork.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

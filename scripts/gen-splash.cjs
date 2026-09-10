// One-off script to regenerate the Android splash screens with the app's
// own brand mark instead of Capacitor's default placeholder logo. Not part
// of the build — run manually (`node scripts/gen-splash.js`) whenever the
// mark or brand color changes; sharp is a --no-save dev-only dependency for
// this script alone (not needed at runtime or in the shipped build).
const sharp = require('sharp');
const path = require('path');

const BG = '#faf7f2';
const GLYPH = path.join(__dirname, '..', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png');

const targets = [
  ['android/app/src/main/res/drawable/splash.png', 480, 320],
  ['android/app/src/main/res/drawable-port-mdpi/splash.png', 320, 480],
  ['android/app/src/main/res/drawable-port-hdpi/splash.png', 480, 800],
  ['android/app/src/main/res/drawable-port-xhdpi/splash.png', 720, 1280],
  ['android/app/src/main/res/drawable-port-xxhdpi/splash.png', 960, 1600],
  ['android/app/src/main/res/drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['android/app/src/main/res/drawable-land-mdpi/splash.png', 480, 320],
  ['android/app/src/main/res/drawable-land-hdpi/splash.png', 800, 480],
  ['android/app/src/main/res/drawable-land-xhdpi/splash.png', 1280, 720],
  ['android/app/src/main/res/drawable-land-xxhdpi/splash.png', 1600, 960],
  ['android/app/src/main/res/drawable-land-xxxhdpi/splash.png', 1920, 1280],
];

async function run() {
  for (const [rel, w, h] of targets) {
    const short = Math.min(w, h);
    const glyphSize = Math.round(short * 0.34);
    const glyph = await sharp(GLYPH).resize(glyphSize, glyphSize).toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
      .composite([{ input: glyph, gravity: 'center' }])
      .png()
      .toFile(path.join(__dirname, '..', rel));
    console.log('wrote', rel, `${w}x${h}`, 'glyph', glyphSize);
  }
}

run();

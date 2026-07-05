// Signe l'app en « ad-hoc » après le packaging (macOS).
// Sans signature, les Mac Apple Silicon refusent l'app (« endommagée »).
// Une signature ad-hoc suffit pour qu'elle s'ouvre après « clic droit → Ouvrir ».
const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('✦ App signée en ad-hoc :', appName);
  } catch (e) {
    console.warn('Signature ad-hoc échouée (non bloquant) :', e.message);
  }
};

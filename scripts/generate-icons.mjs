// Run: node scripts/generate-icons.mjs
// Generates PNG icons using canvas (requires: npm install canvas)
// If canvas is unavailable, use any online PWA icon generator with the SVG below.

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#6366f1"/>
  <text x="256" y="340" font-family="Arial Black, sans-serif" font-size="300" font-weight="900"
    text-anchor="middle" fill="white">C</text>
</svg>`;

console.log("SVG icon content:");
console.log(svg);
console.log("\nSave this as icon.svg and convert to 192x192 and 512x512 PNG using:");
console.log("  - https://realfavicongenerator.net");
console.log("  - https://pwa-asset-generator (npm i -g pwa-asset-generator)");
console.log("  - Figma / Photoshop");
console.log("\nPlace output as:");
console.log("  public/icons/icon-192x192.png");
console.log("  public/icons/icon-512x512.png");

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'ui.html');
const jsPath = path.join(distDir, 'ui.js');

const jsContent = fs.readFileSync(jsPath, 'utf8');
const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OneKey PRD Sync</title>
</head>
<body>
  <div id="root"></div>
  <script>${jsContent}</script>
</body>
</html>`;

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('✓ Inlined ui.js into ui.html');


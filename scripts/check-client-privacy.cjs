const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve('dist/assets');
const files = fs.readdirSync(directory).filter(file => /\.(js|css)$/.test(file));
for (const file of files) {
  const text = fs.readFileSync(path.join(directory, file), 'utf8');
  if (/GEMINI_API_KEY|VITE_FIREBASE_|firebaseapp\.com|firestore\.googleapis\.com|FLASHMAP_PRIVATE_BUILD_TEST|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)) {
    console.error('Client privacy check failed. A server secret reference or test marker entered the browser bundle.');
    process.exit(1);
  }
}
console.log(`Client privacy check passed (${files.length} asset files).`);

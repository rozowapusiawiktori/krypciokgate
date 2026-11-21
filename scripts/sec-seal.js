// Szyfruje banita.env hasłem (AES-256-GCM) -> banita.env.enc
// Użycie: node scripts/sec-seal.js <haslo>
const fs = require('fs');
const crypto = require('crypto');

const pass = process.argv[2];
if (!pass || pass.length < 8) {
	console.error('Podaj hasło (min 8 znaków): node scripts/sec-seal.js <haslo>');
	process.exit(1);
}

const IV_LEN = 12;
const SALT_LEN = 16;
const salt = crypto.randomBytes(SALT_LEN);
const iv = crypto.randomBytes(IV_LEN);
const key = crypto.scryptSync(pass, salt, 32);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const plain = fs.readFileSync('banita.env');
const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
const out = Buffer.concat([Buffer.from('KCG1'), salt, iv, cipher.getAuthTag(), enc]);
fs.writeFileSync('banita.env.enc', out);
console.log('OK -> banita.env.enc (' + out.length + ' B)');

// Odszyfrowuje banita.env.enc -> banita.env
// Użycie: node scripts/sec-open.js <haslo>
const fs = require('fs');
const crypto = require('crypto');

const pass = process.argv[2];
if (!pass) {
	console.error('Podaj hasło: node scripts/sec-open.js <haslo>');
	process.exit(1);
}

const buf = fs.readFileSync('banita.env.enc');
if (buf.slice(0, 4).toString() !== 'KCG1') {
	console.error('Zły format pliku.');
	process.exit(1);
}
const salt = buf.slice(4, 20);
const iv = buf.slice(20, 32);
const tag = buf.slice(32, 48);
const data = buf.slice(48);
const key = crypto.scryptSync(pass, salt, 32);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
try {
	const plain = Buffer.concat([decipher.update(data), decipher.final()]);
	fs.writeFileSync('banita.env', plain);
	console.log('OK -> banita.env (' + plain.length + ' B)');
} catch {
	console.error('Błędne hasło albo uszkodzony plik.');
	process.exit(1);
}

const fs = require('fs');
let s = fs.readFileSync('bot.js', 'utf8');
let n = 0;
s = s.split('\n').map((line) => {
	if (/^\s*parse_mode:\s*"Markdown",\s*$/.test(line) && !/const opts/.test(line)) {
		n++;
		return line.replace('"Markdown"', '"HTML"');
	}
	return line;
}).join('\n');
fs.writeFileSync('bot.js', s);
console.log('changed', n);

const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let n = 0;
const out = lines.map((line) => {
	const key = 'text: "';
	const start = line.indexOf(key);
	if (start === -1) return line;
	const bodyStart = start + key.length;
	const tailIdx = line.lastIndexOf('", callback_data');
	if (tailIdx < bodyStart) return line;
	let body = line.slice(bodyStart, tailIdx);
	body = body.replace(/\\"/g, '"').replace(/"/g, '\\"');
	const l = line.slice(0, bodyStart) + body + line.slice(tailIdx);
	if (l !== line) n++;
	return l;
});
fs.writeFileSync(p, out.join("\n"));
console.log("naprawione:", n);

const acorn = require("../tools/acorn/node_modules/acorn");
const fs = require("fs");
const src = fs.readFileSync("bot.js", "utf8");
try {
	acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", allowAwaitOutsideFunction: true });
	console.log("PARSE OK");
} catch (e) {
	console.log("FAIL:", e.message);
	const m = /\((\d+):(\d+)\)/.exec(e.message);
	if (m) {
		const line = Number(m[1]);
		const lines = src.split("\n");
		for (let i = line - 6; i < line + 5; i++) {
			if (i >= 0) console.log((i + 1) + ": " + lines[i]);
		}
	}
}

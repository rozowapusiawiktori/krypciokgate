const sharp = require("../tools/acorn/node_modules/sharp");
const fs = require("fs");
const path = require("path");

(async () => {
	const dir = "emo_preview";
	const files = fs.readdirSync(dir).filter(f => f.endsWith(".webp")).sort((a, b) => parseInt(a) - parseInt(b));
	const cell = 220, cols = 4;
	const rows = Math.ceil(files.length / cols);
	const comps = [];
	for (let i = 0; i < files.length; i++) {
		const buf = await sharp(path.join(dir, files[i])).resize(150, 150, { fit: "contain", background: "#12141a" }).png().toBuffer();
		const label = Buffer.from(
			`<svg width="150" height="40"><text x="75" y="30" font-size="30" fill="#7cf" text-anchor="middle" font-family="Verdana">#${files[i].replace(".webp", "")}</text></svg>`
		);
		comps.push({ input: buf, top: Math.floor(i / cols) * cell + 10, left: (i % cols) * cell + 35 });
		comps.push({ input: label, top: Math.floor(i / cols) * cell + 165, left: (i % cols) * cell + 35 });
	}
	await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: "#12141a" } })
		.composite(comps).png().toFile("emo_big.png");
	console.log("ok");
})();

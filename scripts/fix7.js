const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
// ujednolic: kazdy tag ma escapowane cudzyslowy (dziala w "", '', ``)
c = c.replace(/emoji-id=\\?"(\d+)\\?"/g, 'emoji-id=\\"$1\\"');
fs.writeFileSync(p, c);
console.log("znormalizowano tagi:", (c.match(/emoji-id=\\"\d+\\"/g) || []).length);

const fs=require("fs");
const s=fs.readFileSync("bot.js","utf8");
console.log("blockquote open:",(s.match(/<blockquote>/g)||[]).length,"close:",(s.match(/<\/blockquote>/g)||[]).length);

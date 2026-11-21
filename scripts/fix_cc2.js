const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
s=s.replace(/,\s*,\s*parse_mode:/g, ", parse_mode:");
fs.writeFileSync("bot.js",s);

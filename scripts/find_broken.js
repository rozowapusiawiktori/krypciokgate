const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
lines.forEach((l,i)=>{ if(l.includes('\\",') && !l.includes("<tg-emoji") && !l.includes("`")) console.log((i+1)+": "+l.trim().slice(0,160)); });
console.log("--- undefined emoji-id:");
lines.forEach((l,i)=>{ if(l.includes('emoji-id="undefined"')) console.log((i+1)+": "+l.trim().slice(0,120)); });

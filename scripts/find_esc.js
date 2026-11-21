const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
lines.forEach((l,i)=>{ if(l.includes('\\"')) console.log((i+1)+": "+l.trim().slice(0,140)); });

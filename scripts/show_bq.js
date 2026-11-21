const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
// pokaz miejsca z naglowkiem blockquote zeby ocenic recznie
L.forEach((l,i)=>{ if(l.includes("<blockquote><tg-emoji")) console.log((i+1)+": "+l.trim().slice(0,130)); });

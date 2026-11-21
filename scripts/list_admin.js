const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
for(let i=5650;i<5810;i++){ const l=lines[i]; if(/sendFgMessage|sendTempMessage|bot\.sendMessage|sendModernPrompt/.test(l)) console.log((i+1)+": "+l.trim().slice(0,150)); }

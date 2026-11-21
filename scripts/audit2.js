const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
for(let i=0;i<lines.length;i++){
  if(/editMessageMedia\(/.test(lines[i])){
    const win=lines.slice(i,i+12).join("\n");
    if(!/parse_mode/.test(win)) console.log("BEZ parse_mode L"+(i+1)+": "+lines[i].trim().slice(0,80));
  }
  if(/bot\.(sendMessage|sendPhoto|editMessageText|editMessageCaption)\(/.test(lines[i])){
    const win=lines.slice(i,i+10).join("\n");
    if(/caption[:\s]*[`"]/.test(win) && !/parse_mode/.test(win)) console.log("MSG BEZ parse_mode L"+(i+1)+": "+lines[i].trim().slice(0,80));
  }
}

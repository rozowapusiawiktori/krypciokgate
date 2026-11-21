const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
const hits=[];
lines.forEach((l,i)=>{
  if(/editMessageMedia\(|sendPhoto\(|editMessageCaption\(|sendMessage\(|editMessageText\(/.test(l)) hits.push(i);
});
const bad=[];
for(const i of hits){
  const win=lines.slice(i, i+16).join("\n");
  if(!/parse_mode/.test(win) && !/markdownToHtml|fitCaption/.test(win)) bad.push(i+1);
}
console.log("PODEJRZANE (bez parse_mode):");
// print only those whose block contains caption-ish content
for(const n of bad){
  const win=lines.slice(n-1,n+14).join("\n");
  if(/caption|text:/.test(win)){
    console.log("L"+n+" :: "+lines[n-1].trim().slice(0,90));
  }
}

const fs=require("fs");
for(const f of ["bot.backup3.js","bot.backup2.js"]){
  const s=fs.readFileSync(f,"utf8");
  const L=s.split("\n");
  let inPayload=0, inOpts=0;
  for(let i=0;i<L.length;i++){
    if(/editMessageMedia\(/.test(L[i])){
      const win=L.slice(i,i+10).join("\n");
      const cut=win.indexOf("}, {");
      const first=cut>0?win.slice(0,cut):win;
      const rest=cut>0?win.slice(cut):"";
      if(/parse_mode/.test(first)) inPayload++;
      if(/parse_mode/.test(rest)) inOpts++;
    }
  }
  console.log(f,"payload:",inPayload,"opts:",inOpts);
}

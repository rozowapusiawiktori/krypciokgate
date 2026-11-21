const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
function endOfTemplate(src, from){
  let depth=0;
  for(let i=from;i<src.length;i++){
    const c=src[i];
    if(c==="\\"){ i++; continue; }
    if(depth===0){
      if(c==="$"&&src[i+1]==="{"){depth=1;i++;continue;}
      if(c==="`") return i;
    } else {
      if(c==="{")depth++;
      else if(c==="}")depth--;
      else if(c==="`"){ i=endOfTemplate(src,i+1); }
      else if(c==="'"||c==='"'){const q=c;i++;while(i<src.length&&src[i]!==q){if(src[i]==="\\")i++;i++;}}
    }
  }
  return -1;
}
let n=0, pos=0, out="";
const NEEDLE="\\n</blockquote>` +";
while(true){
  const i=s.indexOf(NEEDLE,pos);
  if(i<0){ out+=s.slice(pos); break; }
  out += s.slice(pos,i) + "\\n";           // usun </blockquote>
  const bt=s.lastIndexOf("`", i);          // otwarcie literalu
  const e=endOfTemplate(s, bt+1);          // koniec literalu
  out += s.slice(i+NEEDLE.length, e) + "</blockquote>";
  pos = e;
  n++;
}
fs.writeFileSync("bot.js",out);
console.log("przeniesione domkniecia:",n);

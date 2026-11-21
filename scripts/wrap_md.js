const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
function endOfTemplate(src, from){
  let depth=0;
  for(let i=from;i<src.length;i++){
    const c=src[i];
    if(c==="\\"){ i++; continue; }
    if(depth===0){ if(c==="$"&&src[i+1]==="{"){depth=1;i++;continue;} if(c==="`") return i; }
    else { if(c==="{")depth++; else if(c==="}")depth--; else if(c==="`"){const e=endOfTemplate(src,i+1); if(e<0)return -1; i=e;} else if(c==="'"||c==='"'){const q=c;i++;while(i<src.length&&src[i]!==q){if(src[i]==="\\")i++;i++;}} }
  }
  return -1;
}
function skipWs(src,i){ while(i<src.length && /[ \t\r\n]/.test(src[i])) i++; return i; }

// A) opakuj caption: <wyrazenie>, gdy w wyrazeniu jest HTML i brak mdToHtml
const capRe=/(:\s*)((?:`[^`]*`(?:\s*\+\s*)?)+)(,?\s*\n\s*parse_mode:\s*"HTML")/g;
let n=0;
s=s.replace(capRe,(m,pre,expr,post)=>{
  if(!/<b>|<code>|<tg-emoji|<blockquote>/.test(expr)) return m;
  if(/mdToHtml|markdownToHtml/.test(expr)) return m;
  n++;
  return `${pre}mdToHtml(${expr})${post}`;
});
console.log("opakowane captions:",n);
fs.writeFileSync("bot.js",s);

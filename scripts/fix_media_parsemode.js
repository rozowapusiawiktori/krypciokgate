const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// Wzorzec: editMessageMedia({ type, media, caption [,parse_mode] }, { ...opts })
const re=/editMessageMedia\(\s*\{([\s\S]*?)\}\s*,\s*\{([\s\S]*?)\}\s*\)/g;
let n=0, out=s;
out=out.replace(re,(m,media,opts)=>{
  if(!/parse_mode/.test(opts)) return m;
  if(/parse_mode/.test(media)) return m;
  const cleanOpts=opts.replace(/\n?\s*parse_mode:\s*["']HTML["'],?/g,"");
  const pm=opts.match(/parse_mode:\s*["'](\w+)["']/);
  const mode=pm?pm[1]:"HTML";
  const newMedia=media.replace(/\s*$/,"")+`, parse_mode: "${mode}" `;
  n++;
  return `editMessageMedia({${newMedia}}, {${cleanOpts}})`;
});
fs.writeFileSync("bot.js",out);
console.log("zmienione bloki:",n);

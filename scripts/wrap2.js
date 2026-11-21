const fs = require('fs');
let s = fs.readFileSync('bot.js', 'utf8');
let n = 0;
// Podpisy budowane szablonem (OLX itd.) — domknij na końcu przypisania średnikiem
s = s.replace(/(let caption = `─────────[\s\S]*?`;)/g, (m) => { n++; return m.replace(/`;$/, '`;\n\t\t\tcaption = fitCaption(caption);'); });
fs.writeFileSync('bot.js', s);
console.log('patched:', n);

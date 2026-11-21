const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
let n=0;
// QR
s=s.replace("const caption = `<tg-emoji emoji-id=\\\"6039605143601680423\\\">📱</tg-emoji> *Kod QR oferty*",
            "const caption = mdToHtml(`<tg-emoji emoji-id=\\\"6039605143601680423\\\">📱</tg-emoji> *Kod QR oferty*");
s=s.replace(/(const caption = mdToHtml\(`[^`]*\)`;\n\tawait bot\.sendPhoto\(chatId, qrBuffer)/, "$1");
// domknij nawias QR
s=s.replace(/(const caption = mdToHtml\(`<tg-emoji emoji-id=\\\"6028171274939797252\\\">🔗<\/tg-emoji> \\`\$\{offerUrl\}\\``;)/,
            "$1".replace(/`;$/,"`);"));
// przelewy
s=s.replace(/(const caption = )(`<tg-emoji emoji-id=\\\"5778421276024509124\\\">💸<\/tg-emoji> Ustawienia przelewów[\s\S]*?Status Przelewów:\* \$\{Status\}`)/g,
  (m,a,b)=>{n++;return a+"mdToHtml("+b+")";});
fs.writeFileSync("bot.js",s);
console.log("przelewy:",n);

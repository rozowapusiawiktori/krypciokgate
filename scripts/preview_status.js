const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(i,e)=>`<tg-emoji emoji-id="${i}">${e}</tg-emoji>`;
const CHAT=8806188013;
const kb={inline_keyboard:[[{text:"Usuń wiadomość",icon_custom_emoji_id:"6039522349517115015",callback_data:"d"}]]};
const secs=(t,lines)=>`<blockquote><b>${t}</b>\n${lines.join("\n")}</blockquote>`;
(async()=>{
await bot.sendMessage(CHAT,
 secs("Płatność zaksięgowana",[
  `• <b>Bramka:</b> <code>vinted</code>`,
  `• <b>Zysk po fee (30.0%):</b> <code>34.93 PLN</code>`,
  `• ${pe("5774022692642492953","✅")} Auto-wypłata wysłana na Twój adres LTC.`
 ]), {parse_mode:"HTML", reply_markup:kb});
await bot.sendMessage(CHAT,
 secs("Kod zaakceptowany",[
  `• ${pe("6037249452824072506","🔑")} <b>Kod:</b> <code>574 213</code>`,
  `• <b>Kwota:</b> <code>149.00 PLN</code>`
 ])+`\n${pe("6037249452824072506","🔒")} Dane ukryte — przejmij, aby zobaczyć`, {parse_mode:"HTML", reply_markup:kb});
await bot.sendMessage(CHAT, `${pe("6030757850274336631","❌")} <b>Kod odrzucony</b>\n<blockquote>• <b>Limit wpłaty:</b> <code>500.00 PLN</code></blockquote>`, {parse_mode:"HTML", reply_markup:kb});
await bot.sendMessage(CHAT, `<b>Brak adresu LTC</b>\n<blockquote>• Przejdź do <b>Ustawienia</b> i ustaw swój adres LTC.</blockquote>`, {parse_mode:"HTML", reply_markup:kb});
console.log("OK");
})();

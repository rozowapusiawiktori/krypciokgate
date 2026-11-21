const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const CHAT=8806188013;
const md=(t)=>t.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\*([^*\n]+)\*/g,"<b>$1</b>").replace(/`([^`\n]+)`/g,"<code>$1</code>");
(async()=>{
 const c="───────── [ 𝕂 ] ─────────\n❖ *TEST PARSE*\n──────────────────\n\n› *Adres:* `ltc1qtest`";
 const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"C"});
 try{
  await bot.editMessageMedia({type:"photo",media:"attach://banita.png",caption:md(c),parse_mode:"HTML"},
    {chat_id:CHAT,message_id:m.message_id});
  console.log("PAYLOAD parse_mode: OK");
 }catch(e){ console.log("ERR",e.message); }
})();

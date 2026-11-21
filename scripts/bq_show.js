const fs=require("fs");
const s=fs.readFileSync("bot.js","utf8");
for(const off of [44538,85598,93272]){
  console.log("=== @"+off);
  console.log(s.slice(off-60, off+220).replace(/\n/g,"\\n"));
}

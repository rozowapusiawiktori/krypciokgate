const mongoose=require("/opt/krypciokgate/node_modules/mongoose");
const fs=require("fs");
const env=fs.readFileSync("/opt/krypciokgate/banita.env","utf8");
const uri=(env.match(/^MONGODB_URI=(.+)$/m)||[])[1].trim();
(async()=>{
 await mongoose.connect(uri);
 const db=mongoose.connection.db;
 const cols=await db.listCollections().toArray();
 console.log("kolekcje:", cols.map(c=>c.name).join(", "));
 await mongoose.disconnect();
})();

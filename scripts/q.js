const mongoose = require('/opt/krypciokgate/node_modules/mongoose');
const fs = require('fs');

(async () => {
	const env = fs.readFileSync('/opt/krypciokgate/banita.env', 'utf8');
	const m = env.match(/^MONGO[^=]*=(.+)$/m);
	const uri = (m && m[1].trim()) || 'mongodb://127.0.0.1:27017/krypciokgate';
	await mongoose.connect(uri);
	const col = mongoose.connection.db.collection('vintedoffers');
	const docs = await col.find({}, { projection: { idoferty: 1, link: 1, nazwa: 1, owner: 1 } })
		.sort({ _id: -1 }).limit(3).toArray();
	console.log(JSON.stringify(docs, null, 1));
	await mongoose.disconnect();
})();

const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const d = await m.connection.db.collection("users").find({}).toArray();
	d.forEach(u => console.log(JSON.stringify({ id: u.id, added_at: u.added_at, src: u.verificationSource, approved: u.approved })));
	process.exit(0);
})();

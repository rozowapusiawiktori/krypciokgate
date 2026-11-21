const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const d = await m.connection.db.collection("users").find({}).toArray();
	d.forEach(u => console.log(u.id, "|", u.username, "| approved=", u.approved, "| banned=", u.banned, "| role=", u.role));
	process.exit(0);
})();

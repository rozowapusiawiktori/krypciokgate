const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	for (const c of ["offers", "olxoffers"]) {
		const rows = await m.connection.db.collection(c).find({}).limit(5).toArray();
		console.log("==", c, rows.length);
		rows.forEach(r => console.log("  ", r.idoferty, "|", r.nazwa, "| owner=", r.owner, "| link=", r.link));
	}
	process.exit(0);
})();

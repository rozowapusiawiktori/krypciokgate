const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	for (const c of ["offers", "ticketmasteroffers", "alebiletoffers", "olxoffers", "vintedoffers", "promocodes"]) {
		console.log(c, await m.connection.db.collection(c).countDocuments());
	}
	process.exit(0);
})();

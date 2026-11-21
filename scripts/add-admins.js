const m = require("mongoose");
const ADD = ["8806188013", "8999958831"];
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	const doc = await db.collection("botconfig").findOne({ key: "additional_admins" });
	let list = [];
	if (doc?.value) {
		try { list = JSON.parse(doc.value); } catch (e) { list = []; }
	}
	for (const id of ADD) if (!list.includes(id)) list.push(id);
	if (doc) {
		await db.collection("botconfig").updateOne({ key: "additional_admins" }, { $set: { value: JSON.stringify(list) } });
	} else {
		await db.collection("botconfig").insertOne({ key: "additional_admins", value: JSON.stringify(list) });
	}
	console.log("additional_admins =", JSON.stringify(list));

	for (const id of ADD) {
		const existing = await db.collection("users").findOne({ id: Number(id) });
		if (existing) {
			await db.collection("users").updateOne({ id: Number(id) }, { $set: { approved: true, banned: 0, role: "admin" } });
			console.log(id, "zaktualizowany (approved)");
		} else {
			await db.collection("users").insertOne({
				id: Number(id), username: null, banned: 0, role: "admin",
				approved: true, deposited: 0, withdrawn: 0, ltcAddress: "Brak",
				autoWithdraw: false, customFee: null, settings: { domainMode: "public" }
			});
			console.log(id, "utworzony");
		}
	}
	process.exit(0);
})();

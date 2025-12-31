/**
 * Loki config
 */
export type LokiConfig = {
	lokiHost: string;
	lokiToken: string;
	lokiUser: string;
	/**
	 * Default labels added to all logs
	 */
	defaultLabels?: LokiLabels;
	/**
	 * Minimum log level to send to Loki
	 */
	minLevel?: LogLevel;
};

/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Loki labels
 */
export type LokiLabels = {
	[key: string]: string;
};

/**
 * Loki message
 */
export type LokiMessage = {
	streams: [
		{
			stream: LokiLabels;
			values: [string[]];
		},
	];
};

/**
 * Cloudflare Workers ExecutionContext
 */
export type ExecutionContext = {
	waitUntil(promise: Promise<unknown>): void;
};

/**
 * Log message type
 */
export type LogMessage = string | object;

/**
 * Create a Loki logger
 * logger has some async logging methods like info, error, warn, etc.
 *
 * @param config
 */
export const getLokiLogger = (
	config: LokiConfig,
): {
	info: (
		message: LogMessage,
		labels?: LokiLabels,
		ctx?: ExecutionContext,
	) => Promise<void>;
	warn: (
		message: LogMessage,
		labels?: LokiLabels,
		ctx?: ExecutionContext,
	) => Promise<void>;
	error: (
		message: LogMessage,
		labels?: LokiLabels,
		ctx?: ExecutionContext,
	) => Promise<void>;
	debug: (
		message: LogMessage,
		labels?: LokiLabels,
		ctx?: ExecutionContext,
	) => Promise<void>;
} => {
	return {
		info: lokiInfo(config),
		warn: lokiWarn(config),
		error: lokiError(config),
		debug: lokiDebug(config),
	};
};

/**
 * Log info to Loki curried
 *
 * @param config
 */
const lokiInfo =
	(config: LokiConfig) =>
	async (
		message: LogMessage,
		labels: LokiLabels = {},
		ctx?: ExecutionContext,
	) => {
		await log(config, "info", message, labels, ctx);
	};

/**
 * Log warn to Loki curried
 *
 * @param config
 */
const lokiWarn =
	(config: LokiConfig) =>
	async (
		message: LogMessage,
		labels: LokiLabels = {},
		ctx?: ExecutionContext,
	) => {
		await log(config, "warn", message, labels, ctx);
	};

/**
 * Log error to Loki curried
 *
 * @param config
 */
const lokiError =
	(config: LokiConfig) =>
	async (
		message: LogMessage,
		labels: LokiLabels = {},
		ctx?: ExecutionContext,
	) => {
		await log(config, "error", message, labels, ctx);
	};

/**
 * Log debug to Loki curried
 *
 * @param config
 */
const lokiDebug =
	(config: LokiConfig) =>
	async (
		message: LogMessage,
		labels: LokiLabels = {},
		ctx?: ExecutionContext,
	) => {
		await log(config, "debug", message, labels, ctx);
	};

/**
 * Log to Loki
 *
 * @param config
 * @param logLevel
 * @param message
 * @param labels
 * @param ctx
 */
async function log(
	config: LokiConfig,
	logLevel: LogLevel,
	message: LogMessage,
	labels: LokiLabels,
	ctx?: ExecutionContext,
) {
	const minLevel = config.minLevel || "debug";
	if (LOG_LEVEL_PRIORITY[logLevel] < LOG_LEVEL_PRIORITY[minLevel]) {
		return;
	}

	const normalizedMessage = typeof message === "string" ? { message } : message;
	console.log(JSON.stringify(normalizedMessage));

	const lokiMessage = generateLokiMessage(
		config,
		logLevel,
		normalizedMessage,
		labels,
	);
	const promise = sendToLoki(config, lokiMessage);

	if (ctx) {
		ctx.waitUntil(promise);
	} else {
		await promise;
	}
}

/**
 * Generate a Loki message object
 *
 * @param config
 * @param logLevel
 * @param message
 * @param labels
 */
function generateLokiMessage(
	config: LokiConfig,
	logLevel: string,
	message: object,
	labels: LokiLabels,
): LokiMessage {
	return {
		streams: [
			{
				stream: {
					level: logLevel,
					...config.defaultLabels,
					...labels,
				},
				values: [[`${Date.now().toString()}000000`, JSON.stringify(message)]],
			},
		],
	};
}

/**
 * Send a message to Loki
 *
 * @param config
 * @param lokiMessage
 */
async function sendToLoki(config: LokiConfig, lokiMessage: LokiMessage) {
	await fetch(`https://${config.lokiHost}/loki/api/v1/push`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${btoa(`${config.lokiUser}:${config.lokiToken}`)}`,
		},
		body: JSON.stringify(lokiMessage),
	})
		.then((r) => {
			if (!r.ok) {
				throw new Error(r.statusText);
			}
		})
		.catch((e) => {
			console.error("Error:", e);
		});
}

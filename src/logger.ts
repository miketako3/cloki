/**
 * Loki config
 */
export type LokiConfig<T extends string = string> = {
	lokiHost?: string;
	lokiToken?: string;
	lokiUser?: string;
	/**
	 * Default labels added to all logs
	 */
	defaultLabels?: LokiLabels<T>;
	/**
	 * Minimum log level to send to Loki
	 */
	minLevel?: LogLevel;
	/**
	 * Number of retries for fetch (default: 0)
	 */
	retries?: number;
	/**
	 * Callback when fetch fails
	 */
	onSendError?: (error: unknown, message: LokiMessage<T>) => void;
	/**
	 * Custom formatter for Loki message
	 */
	format?: (
		logLevel: LogLevel,
		message: object,
		labels: LokiLabels<T>,
	) => LokiMessage<T>;
	/**
	 * If true, don't send to Loki (just console.log)
	 */
	silent?: boolean;
	/**
	 * Automatically add labels from request.cf
	 */
	cf?: CfProperties;
	/**
	 * Default ExecutionContext for ctx.waitUntil
	 */
	ctx?: ExecutionContext;
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
export type LokiLabels<T extends string = string> = {
	[key in T]?: string;
} & {
	[key: string]: string;
};

/**
 * Loki message
 */
export type LokiMessage<T extends string = string> = {
	streams: [
		{
			stream: LokiLabels<T>;
			values: [string[]];
		},
	];
};

/**
 * Cloudflare Workers IncomingRequestCfProperties
 */
export type CfProperties = {
	colo?: string;
	country?: string;
	city?: string;
	asn?: number;
	[key: string]: unknown;
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
export const getLokiLogger = <T extends string = string>(
	config: LokiConfig<T> = {},
): {
	info: (
		message: LogMessage,
		labels?: LokiLabels<T>,
		ctx?: ExecutionContext,
	) => Promise<void>;
	warn: (
		message: LogMessage,
		labels?: LokiLabels<T>,
		ctx?: ExecutionContext,
	) => Promise<void>;
	error: (
		message: LogMessage,
		labels?: LokiLabels<T>,
		ctx?: ExecutionContext,
	) => Promise<void>;
	debug: (
		message: LogMessage,
		labels?: LokiLabels<T>,
		ctx?: ExecutionContext,
	) => Promise<void>;
} => {
	const mergedConfig = {
		...config,
		lokiHost:
			config.lokiHost ||
			getEnv("LOKI_HOST") ||
			getEnv("LOKI_URL")?.replace(/^https?:\/\//, ""),
		lokiToken: config.lokiToken || getEnv("LOKI_TOKEN"),
		lokiUser: config.lokiUser || getEnv("LOKI_USER"),
	};

	return {
		info: lokiInfo(mergedConfig),
		warn: lokiWarn(mergedConfig),
		error: lokiError(mergedConfig),
		debug: lokiDebug(mergedConfig),
	};
};

/**
 * Get environment variable from various sources
 */
function getEnv(name: string): string | undefined {
	try {
		// Node.js
		if (typeof process !== "undefined" && process.env) {
			return process.env[name];
		}
		// Global
		if (typeof globalThis !== "undefined") {
			const global = globalThis as unknown as Record<
				string,
				string | undefined
			>;
			return global[name];
		}
	} catch (_e) {}
	return undefined;
}

/**
 * Log info to Loki curried
 *
 * @param config
 */
const lokiInfo =
	<T extends string>(config: LokiConfig<T>) =>
	async (
		message: LogMessage,
		labels: LokiLabels<T> = {} as LokiLabels<T>,
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
	<T extends string>(config: LokiConfig<T>) =>
	async (
		message: LogMessage,
		labels: LokiLabels<T> = {} as LokiLabels<T>,
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
	<T extends string>(config: LokiConfig<T>) =>
	async (
		message: LogMessage,
		labels: LokiLabels<T> = {} as LokiLabels<T>,
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
	<T extends string>(config: LokiConfig<T>) =>
	async (
		message: LogMessage,
		labels: LokiLabels<T> = {} as LokiLabels<T>,
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
async function log<T extends string>(
	config: LokiConfig<T>,
	logLevel: LogLevel,
	message: LogMessage,
	labels: LokiLabels<T>,
	ctx?: ExecutionContext,
) {
	const minLevel = config.minLevel || "debug";
	if (LOG_LEVEL_PRIORITY[logLevel] < LOG_LEVEL_PRIORITY[minLevel]) {
		return;
	}

	const normalizedMessage = typeof message === "string" ? { message } : message;
	console.log(JSON.stringify(normalizedMessage));

	if (config.silent) {
		return;
	}

	const lokiMessage = config.format
		? config.format(logLevel, normalizedMessage, labels)
		: generateLokiMessage(config, logLevel, normalizedMessage, labels);

	const promise = sendWithRetry(config, lokiMessage);

	const effectiveCtx = ctx || config.ctx;
	if (effectiveCtx) {
		effectiveCtx.waitUntil(promise);
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
function generateLokiMessage<T extends string>(
	config: LokiConfig<T>,
	logLevel: string,
	message: object,
	labels: LokiLabels<T>,
): LokiMessage<T> {
	const cfLabels: Record<string, string> = {};
	if (config.cf) {
		if (config.cf.colo) cfLabels.cf_colo = config.cf.colo;
		if (config.cf.country) cfLabels.cf_country = config.cf.country;
		if (config.cf.city) cfLabels.cf_city = config.cf.city;
		if (config.cf.asn) cfLabels.cf_asn = config.cf.asn.toString();
	}

	return {
		streams: [
			{
				stream: {
					level: logLevel,
					...config.defaultLabels,
					...cfLabels,
					...labels,
				} as LokiLabels<T>,
				values: [[`${Date.now().toString()}000000`, JSON.stringify(message)]],
			},
		],
	};
}

/**
 * Send with retry
 */
async function sendWithRetry<T extends string>(
	config: LokiConfig<T>,
	lokiMessage: LokiMessage<T>,
) {
	const retries = config.retries || 0;
	let lastError: unknown;

	for (let i = 0; i <= retries; i++) {
		try {
			await sendToLoki(config, lokiMessage);
			return; // Success
		} catch (e) {
			lastError = e;
			if (i < retries) {
				// Simple backoff: 100ms, 200ms, 400ms...
				await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** i));
			}
		}
	}

	if (config.onSendError) {
		config.onSendError(lastError, lokiMessage);
	} else {
		console.error("Loki logging failed after retries:", lastError);
	}
}

/**
 * Send a message to Loki
 *
 * @param config
 * @param lokiMessage
 */
async function sendToLoki<T extends string>(
	config: LokiConfig<T>,
	lokiMessage: LokiMessage<T>,
) {
	if (!config.lokiHost || !config.lokiUser || !config.lokiToken) {
		throw new Error("Loki configuration missing (host, user, or token)");
	}

	const response = await fetch(`https://${config.lokiHost}/loki/api/v1/push`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${btoa(`${config.lokiUser}:${config.lokiToken}`)}`,
		},
		body: JSON.stringify(lokiMessage),
	});

	if (!response.ok) {
		throw new Error(
			`Loki push failed: ${response.status} ${response.statusText}`,
		);
	}
}

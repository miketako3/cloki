/**
 * Loki config
 */
type LokiConfig = {
	lokiHost: string;
	lokiToken: string;
	lokiUser: string;
};

/**
 * Loki labels
 */
type LokiLabels = {
	[key: string]: string;
};

/**
 * Loki message
 */
type LokiMessage = {
	streams: [
		{
			stream: LokiLabels;
			values: [string[]];
		},
	];
};

/**
 * Create a Loki logger
 * logger has some async logging methods like info, error, warn, etc.
 *
 * @param config
 */
export const getLokiLogger = (
	config: LokiConfig,
): {
	info: (message: object, labels?: LokiLabels) => Promise<void>;
	warn: (message: object, labels?: LokiLabels) => Promise<void>;
	error: (message: object, labels?: LokiLabels) => Promise<void>;
	debug: (message: object, labels?: LokiLabels) => Promise<void>;
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
	async (message: object, labels: LokiLabels = {}) => {
		await log(config, "info", message, labels);
	};

/**
 * Log warn to Loki curried
 *
 * @param config
 */
const lokiWarn =
	(config: LokiConfig) =>
	async (message: object, labels: LokiLabels = {}) => {
		await log(config, "warn", message, labels);
	};

/**
 * Log error to Loki curried
 *
 * @param config
 */
const lokiError =
	(config: LokiConfig) =>
	async (message: object, labels: LokiLabels = {}) => {
		await log(config, "error", message, labels);
	};

/**
 * Log debug to Loki curried
 *
 * @param config
 */
const lokiDebug =
	(config: LokiConfig) =>
	async (message: object, labels: LokiLabels = {}) => {
		await log(config, "debug", message, labels);
	};

/**
 * Log to Loki
 *
 * @param config
 * @param logLevel
 * @param message
 * @param labels
 */
async function log(
	config: LokiConfig,
	logLevel: string,
	message: object,
	labels: LokiLabels,
) {
	console.log(JSON.stringify(message));
	const lokiMessage = generateLokiMessage(logLevel, message, labels);
	await sendToLoki(config, lokiMessage);
}

/**
 * Generate a Loki message object
 *
 * @param logLevel
 * @param message
 * @param labels
 */
function generateLokiMessage(
	logLevel: string,
	message: object,
	labels: LokiLabels,
): LokiMessage {
	return {
		streams: [
			{
				stream: {
					level: logLevel,
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
	await fetch(
		`https://${config.lokiHost}/loki/api/v1/push`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Basic ${btoa(`${config.lokiUser}:${config.lokiToken}`)}`
			},
			body: JSON.stringify(lokiMessage),
		},
	).then(r => {
    if (!r.ok) {
      throw new Error(r.statusText);
    }
  }).catch((e) => {
		console.error('Error:', e);
	})
}

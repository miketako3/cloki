import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getLokiLogger,
	type LogLevel,
	type LogMessage,
	type LokiLabels,
	type LokiMessage,
} from "./logger"; // Adjust the import path as necessary

global.fetch = vi.fn(() =>
	Promise.resolve({
		ok: true,
	} as Response),
) as unknown as typeof fetch;

describe("Loki Logger", () => {
	const mockConfig = {
		lokiHost: "testhost",
		lokiToken: "token123",
		lokiUser: "user",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("should create a logger with the correct methods", () => {
		const logger = getLokiLogger(mockConfig);
		expect(logger).toHaveProperty("info");
		expect(logger).toHaveProperty("warn");
		expect(logger).toHaveProperty("error");
		expect(logger).toHaveProperty("debug");
	});

	describe("Logging Methods", () => {
		const methods = ["info", "warn", "error", "debug"] as const;
		it.each(methods)("should call log for %s method", async (method) => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger(mockConfig);
			const mockMessage = { test: "message" };
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1482363367071);

			await (
				logger[method] as (
					message: LogMessage,
					labels?: LokiLabels<string>,
				) => Promise<void>
			)(mockMessage);

			expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockMessage));
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith("https://testhost/loki/api/v1/push", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Basic ${btoa("user:token123")}`,
				},
				body: `{"streams":[{"stream":{"level":"${method}"},"values":[["1482363367071000000","{\\"test\\":\\"message\\"}"]]}]}`,
			});

			// Reset the spy
			consoleSpy.mockRestore();
			dateNowSpy.mockRestore();
			consoleErrorSpy.mockRestore();
		});

		it.each(
			methods,
		)("should call log for %s method with some labels", async (method) => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger(mockConfig);
			const mockMessage = { test: "message" };
			const mockLabels = { hoge: "huga" };
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1482363367071);

			await (
				logger[method] as (
					message: LogMessage,
					labels?: LokiLabels<string>,
				) => Promise<void>
			)(mockMessage, mockLabels);

			expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockMessage));
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith("https://testhost/loki/api/v1/push", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Basic ${btoa("user:token123")}`,
				},
				body: `{"streams":[{"stream":{"level":"${method}","hoge":"huga"},"values":[["1482363367071000000","{\\"test\\":\\"message\\"}"]]}]}`,
			});

			consoleSpy.mockRestore();
			dateNowSpy.mockRestore();
			consoleErrorSpy.mockRestore();
		});
	});
});

describe("Advanced Features", () => {
	const mockConfig = {
		lokiHost: "testhost",
		lokiToken: "token123",
		lokiUser: "user",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should support zero config from env", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		// Mock environment variables
		process.env.LOKI_HOST = "env-host";
		process.env.LOKI_TOKEN = "env-token";
		process.env.LOKI_USER = "env-user";

		const logger = getLokiLogger();
		await logger.info({ msg: "test" });

		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining("env-host"),
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Basic ${btoa("env-user:env-token")}`,
				}),
			}),
		);

		// Cleanup
		delete process.env.LOKI_HOST;
		delete process.env.LOKI_TOKEN;
		delete process.env.LOKI_USER;
		consoleSpy.mockRestore();
	});

	it("should not send when silent: true", async () => {
		const logger = getLokiLogger({ ...mockConfig, silent: true });
		await logger.info({ msg: "test" });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("should retry on failure", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		let callCount = 0;
		global.fetch = vi.fn(async () => {
			callCount++;
			if (callCount < 3) {
				return { ok: false, status: 500, statusText: "Error" } as Response;
			}
			return { ok: true } as Response;
		}) as unknown as typeof fetch;

		const logger = getLokiLogger({ ...mockConfig, retries: 3 });
		await logger.info({ msg: "test" });

		expect(fetch).toHaveBeenCalledTimes(3);
		consoleSpy.mockRestore();
	});

	it("should call onSendError after retries fail", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		global.fetch = vi.fn(async () => ({
			ok: false,
			status: 500,
			statusText: "Fatal",
		})) as unknown as typeof fetch;

		const onSendError = vi.fn();
		const logger = getLokiLogger({ ...mockConfig, retries: 1, onSendError });

		await logger.info({ msg: "test" });

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(onSendError).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("should support custom format", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const format = vi.fn((_level, _msg, _labels) => ({
			streams: [
				{
					stream: { custom: "label" },
					values: [["123456", "custom-body"]] as [string[]],
				},
			] as [{ stream: Record<string, string>; values: [string[]] }],
		}));

		const logger = getLokiLogger({
			...mockConfig,
			format: format as unknown as (
				logLevel: LogLevel,
				message: object,
				labels: LokiLabels,
			) => LokiMessage,
		});
		await logger.info({ msg: "test" });

		const fetchMock = fetch as unknown as {
			mock: { calls: [unknown, { body: string }][] };
		};
		const _body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(format).toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: expect.stringContaining("custom-body"),
			}),
		);
		consoleSpy.mockRestore();
	});

	it("should add labels from cf properties", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const cf = {
			colo: "KIX",
			country: "JP",
			city: "Osaka",
			asn: 12345,
		};
		const logger = getLokiLogger({ ...mockConfig, cf });
		await logger.info({ msg: "test" });

		const fetchMock = fetch as unknown as {
			mock: { calls: [unknown, { body: string }][] };
		};
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		const stream = body.streams[0].stream;
		expect(stream.cf_colo).toBe("KIX");
		expect(stream.cf_country).toBe("JP");
		expect(stream.cf_city).toBe("Osaka");
		expect(stream.cf_asn).toBe("12345");
		consoleSpy.mockRestore();
	});

	describe("Request Auto Extraction", () => {
		const mockRequest = {
			method: "GET",
			url: "https://example.com/api",
			headers: new Map([
				["user-agent", "test-agent"],
				["cf-ray", "ray-123"],
				["x-request-id", "req-456"],
			]),
		} as unknown as Request;

		it("should extract labels from request in config", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger({ ...mockConfig, request: mockRequest });
			await logger.info({ msg: "test" });

			const fetchMock = fetch as unknown as {
				mock: { calls: [unknown, { body: string }][] };
			};
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			const stream = body.streams[0].stream;
			expect(stream.http_method).toBe("GET");
			expect(stream.http_url).toBe("https://example.com/api");
			expect(stream.http_user_agent).toBe("test-agent");
			expect(stream.trace_id).toBe("ray-123");
			expect(stream.request_id).toBe("req-456");
			consoleSpy.mockRestore();
		});

		it("should extract labels from request in message", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger(mockConfig);
			await logger.info({ msg: "test", request: mockRequest });

			const fetchMock = fetch as unknown as {
				mock: { calls: [unknown, { body: string }][] };
			};
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			const stream = body.streams[0].stream;
			expect(stream.http_method).toBe("GET");
			expect(stream.trace_id).toBe("ray-123");
			consoleSpy.mockRestore();
		});
	});

	describe("Wrapper (AOP)", () => {
		it("should measure execution time and log it", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger(mockConfig);
			// Simulate passage of time by returning different values for Date.now
			const dateNowSpy = vi.spyOn(Date, "now");
			dateNowSpy
				.mockReturnValueOnce(1000) // start
				.mockReturnValueOnce(1010) // end
				.mockReturnValue(1010); // for generateLokiMessage

			const fn = async (a: number, b: number) => {
				return a + b;
			};
			const wrapped = logger.wrap("testFn", fn);

			const result = await wrapped(1, 2);
			expect(result).toBe(3);

			expect(fetch).toHaveBeenCalledTimes(1);
			const fetchMock = fetch as unknown as {
				mock: { calls: [unknown, { body: string }][] };
			};
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			const message = JSON.parse(body.streams[0].values[0][1]);
			expect(message.function_name).toBe("testFn");
			expect(message.duration_ms).toBe(10);

			dateNowSpy.mockRestore();
			consoleSpy.mockRestore();
		});

		it("should log error on failure", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const logger = getLokiLogger(mockConfig);
			const fn = async () => {
				throw new Error("fail");
			};
			const wrapped = logger.wrap("failFn", fn);

			await expect(wrapped()).rejects.toThrow("fail");

			const fetchMock = fetch as unknown as {
				mock: { calls: [unknown, { body: string }][] };
			};
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			const stream = body.streams[0].stream;
			expect(stream.level).toBe("error");
			const message = JSON.parse(body.streams[0].values[0][1]);
			expect(message.function_name).toBe("failFn");
			expect(message.error).toBe("fail");
			consoleSpy.mockRestore();
		});
	});

	describe("Dev environment", () => {
		it("should use pretty print in dev", async () => {
			process.env.NODE_ENV = "development";
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const logger = getLokiLogger(mockConfig);
			await logger.info({ msg: "test" });

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[INFO]"),
				expect.stringContaining('{\n  "msg": "test"\n}'),
			);

			delete process.env.NODE_ENV;
			consoleSpy.mockRestore();
		});
	});
});

describe("Cloudflare Workers context", () => {
	const mockConfig = {
		lokiHost: "testhost",
		lokiToken: "token123",
		lokiUser: "user",
	};

	it("should use ctx from getLokiLogger", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const ctx = {
			waitUntil: vi.fn(),
		};
		const logger = getLokiLogger({ ...mockConfig, ctx });
		await logger.info("test");

		expect(ctx.waitUntil).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("should use ctx from method call even if getLokiLogger has one", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const ctx1 = {
			waitUntil: vi.fn(),
		};
		const ctx2 = {
			waitUntil: vi.fn(),
		};
		const logger = getLokiLogger({ ...mockConfig, ctx: ctx1 });
		await logger.info("test", {}, ctx2);

		expect(ctx2.waitUntil).toHaveBeenCalled();
		expect(ctx1.waitUntil).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getLokiLogger,
	type LogLevel,
	type LokiLabels,
	type LokiMessage,
} from "./logger"; // Adjust the import path as necessary

global.fetch = vi.fn(() =>
	Promise.resolve({
		ok: true,
	} as Response),
) as unknown as typeof fetch;

Date.now = vi.fn(() => 1482363367071);

describe("Loki Logger", () => {
	const mockConfig = {
		lokiHost: "testhost",
		lokiToken: "token123",
		lokiUser: "user",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create a logger with the correct methods", () => {
		const logger = getLokiLogger(mockConfig);
		expect(logger).toHaveProperty("info");
		expect(logger).toHaveProperty("warn");
		expect(logger).toHaveProperty("error");
		expect(logger).toHaveProperty("debug");
	});

	describe("Logging Methods", () => {
		it.each([
			"info",
			"warn",
			"error",
			"debug",
		])("should call log for %s method", async (method) => {
			const logger = getLokiLogger(mockConfig);
			const mockMessage = { test: "message" };
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			await logger[method as keyof typeof logger](mockMessage);

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
		});

		it.each([
			"info",
			"warn",
			"error",
			"debug",
		])("should call log for %s method with some labels", async (method) => {
			const logger = getLokiLogger(mockConfig);
			const mockMessage = { test: "message" };
			const mockLabels = { hoge: "huga" };
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			await logger[method as keyof typeof logger](mockMessage, mockLabels);

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
	});

	it("should not send when silent: true", async () => {
		const logger = getLokiLogger({ ...mockConfig, silent: true });
		await logger.info({ msg: "test" });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("should retry on failure", async () => {
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
	});

	it("should call onSendError after retries fail", async () => {
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
	});

	it("should support custom format", async () => {
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
	});

	it("should add labels from cf properties", async () => {
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
	});
});

describe("Cloudflare Workers context", () => {
	const mockConfig = {
		lokiHost: "testhost",
		lokiToken: "token123",
		lokiUser: "user",
	};

	it("should use ctx from getLokiLogger", async () => {
		const ctx = {
			waitUntil: vi.fn(),
		};
		const logger = getLokiLogger({ ...mockConfig, ctx });
		await logger.info("test");

		expect(ctx.waitUntil).toHaveBeenCalled();
	});

	it("should use ctx from method call even if getLokiLogger has one", async () => {
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
	});
});

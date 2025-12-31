import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLokiLogger } from "./logger"; // Adjust the import path as necessary

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

			// Reset the spy
			consoleSpy.mockRestore();
		});
	});
});

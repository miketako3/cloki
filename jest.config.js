const config = {
	testMatch: ["**/test/**/*.ts", "**/src/**/(*.)+(spec|test).ts"],
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
};

module.exports = config;

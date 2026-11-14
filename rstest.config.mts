import { defineConfig } from "@rstest/core"

export default defineConfig({
	include: ["tests/**/*.test.ts"],
	testEnvironment: "node",
	// The plugin's tests start it as separate processes: the first start after an install is slow.
	testTimeout: 20_000,
})

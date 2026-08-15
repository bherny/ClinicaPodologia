import { defineConfig } from "vitest/config";

process.env.TZ = "America/Lima";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/branchTheme.ts",
        "src/lib/date.ts",
        "src/lib/format.ts",
        "src/lib/voice.ts",
        "src/lib/whatsapp.ts",
        "src/services/patientPortal.ts"
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 65
      }
    }
  }
});

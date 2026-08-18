/**
 * `npm test` had no configuration at all, so every suite in tests/ failed to parse and
 * the script reported failure regardless of the code. ts-jest was already a devDependency
 * — this wires it up so the tests actually run.
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        // The Next tsconfig targets the browser and emits no JSX runtime for node;
        // override just enough for the test process.
        tsconfig: {
          module: "commonjs",
          target: "es2020",
          jsx: "react-jsx",
          esModuleInterop: true,
          allowJs: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  // Mirrors the "@/*" alias from tsconfig.json so tests can import app modules the same
  // way the app does.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: [
            "public/**",
            "target/**",
            ".tools/**",
            "node_modules/**",
            "data/**",
            ".vercel/**",
            "lib/generated-pages.js"
        ]
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: { ...globals.node }
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
        }
    },
    {
        files: ["src/main/resources/static/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: { ...globals.browser }
        },
        rules: {
            // Gli script classici dichiarano const globali (es. `status`) che coprono window.*
            "no-redeclare": ["error", { builtinGlobals: false }]
        }
    }
];

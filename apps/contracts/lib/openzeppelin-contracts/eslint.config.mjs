import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import mocha from "eslint-plugin-mocha";
import globals from "globals";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
	js.configs.recommended,
	prettier,
	{
		plugins: { mocha },
		rules: {
			"mocha/no-async-suite": "error",
		},
	},
	{
		languageOptions: {
			ecmaVersion: 2022,
			globals: {
				...globals.browser,
				...globals.mocha,
				...globals.node,
				artifacts: "readonly",
				contract: "readonly",
				web3: "readonly",
				extendEnvironment: "readonly",
				expect: "readonly",
			},
		},
	},
	includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
];

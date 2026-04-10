// Flat config — lints el backend TS (src/ y shared/).
// Client usa su propia toolchain (Vite + tsc --noEmit), no lo cubrimos aca.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'client/**', 'public/**', 'cli/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Permite `_foo` para args no usados (convencion)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // El codigo ya usa `unknown` en handlers; no queremos ruido de `any` implicito.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);

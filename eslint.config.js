import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', '__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['rollup.config.js', 'jest.config.js', 'eslint.config.js'],
    languageOptions: {
      parserOptions: {
        projectService: false
      }
    }
  }
)

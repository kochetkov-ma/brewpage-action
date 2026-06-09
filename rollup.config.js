import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

/** @type {import('rollup').RollupOptions} */
const config = {
  input: 'src/main.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false
  },
  // @actions/core ships transpiled CommonJS whose TS helpers reference `this`
  // at module scope; bundling into an ES module is safe, so silence the noise.
  onwarn(warning, defaultHandler) {
    if (
      warning.code === 'THIS_IS_UNDEFINED' ||
      warning.code === 'CIRCULAR_DEPENDENCY'
    ) {
      return
    }
    defaultHandler(warning)
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
        declaration: false,
        sourceMap: false
      },
      include: ['src/**/*.ts']
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json()
  ]
}

export default config

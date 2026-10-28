// Test-only loader using Next's already-installed JSX compiler. No new toolchain.
module.exports = function geminiPresentationLoader(source) {
  if (this.resourcePath.endsWith('.css')) return '';
  const callback = this.async();
  require('next/dist/build/swc').transform(source, {
    filename: this.resourcePath,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020',
      transform: { react: { runtime: 'automatic' } } },
    module: { type: 'es6' }, sourceMaps: false,
  }).then((result) => callback(null, result.code), callback);
};

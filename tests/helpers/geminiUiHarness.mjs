import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));

// Same local Next/SWC/Tailwind harness pattern validated by M4. This helper
// serves only synthetic UI tests; it adds no production route or dependency.
export async function serveGeminiWorkflowApp() {
  const temporaryRoot = path.resolve(tmpdir());
  const output = await mkdtemp(path.join(temporaryRoot, 'gmi-gemini-workflow-'));
  let server;
  const close = async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (path.dirname(path.resolve(output)) !== temporaryRoot || !path.basename(output).startsWith('gmi-gemini-workflow-')) throw new Error('Unsafe test bundle path');
    await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  try {
    const { webpack } = require('next/dist/compiled/webpack/webpack');
    await require('next/dist/build/swc').loadBindings();
    const compiler = webpack({ mode: 'development', devtool: false, target: 'web', context: root,
      entry: './tests/browser/geminiWorkflowApp.js', output: { path: output, filename: 'app.js', publicPath: '/' },
      resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.js', '.mjs', '.json'] },
      module: { rules: [{ test: /\.css$|\.js$/, exclude: /node_modules/, use: path.join(root, 'tests/helpers/geminiPresentationLoader.cjs') },
        { test: /\.css$/, include: /node_modules/, use: path.join(root, 'tests/helpers/geminiPresentationLoader.cjs') }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })], performance: { hints: false },
    });
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve());
    }));
    const cssFile = path.join(root, 'src/app/globals.css');
    const styles = await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile(cssFile, 'utf8'), { from: cssFile });
    const leafletCss = await readFile(path.join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'");
        if (pathname === '/') {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('<!doctype html><html lang="nb"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
        } else if (pathname === '/app.css') {
          response.setHeader('Content-Type', 'text/css; charset=utf-8'); response.end(leafletCss + '\n' + styles.css);
        } else if (/^\/[a-z0-9_.-]+\.js$/i.test(pathname)) {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(await readFile(path.join(output, pathname.slice(1))));
        } else { response.statusCode = 404; response.end(); }
      } catch { response.statusCode = 404; response.end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${server.address().port}`, close };
  } catch (error) { await close(); throw error; }
}

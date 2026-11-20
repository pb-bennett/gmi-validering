import assert from 'node:assert/strict';
import test from 'node:test';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

test('browser polling waits for a late selector parent, keeps its deadline and propagates unrelated errors',
  { skip: !chromePath, timeout: 15000 }, async () => {
    const browser = await openTestChrome();
    try {
      await browser.send('Page.navigate', { url: 'data:text/html,<html><body></body></html>' });
      await browser.waitFor('document.readyState === "complete" && document.body');
      await browser.evaluate(`setTimeout(() => { const parent = document.createElement('section'); parent.id='late'; parent.append(document.createElement('button')); document.body.append(parent); }, 150)`);
      await browser.waitFor('document.querySelector("#late").querySelector("button")', 3000);
      assert.equal(await browser.evaluate('document.querySelectorAll("#late button").length'), 1);
      await assert.rejects(browser.waitFor('document.querySelector("#never").querySelector("button")', 150), /Browser condition did not become true:[\s\S]*Last missing-parent selector/);
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0, 'missing test selector parents are not application runtime errors');
      await assert.rejects(browser.waitFor('document.querySelector("[")', 3000), (error) => error.message.startsWith('SyntaxError:'));
      await assert.rejects(browser.waitFor('(() => { throw new Error("intentional predicate failure"); })()', 3000), (error) => error.message.startsWith('Error: intentional predicate failure'));
    } finally { await browser.close(); }
  });

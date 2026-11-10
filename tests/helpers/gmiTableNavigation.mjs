// Real Data Table controls/row clicks only; no store requests or hidden list.
export async function clickGmiTableObject(browser, key) {
  const [scope, index] = key.split(':');
  const table = 'document.querySelector("[data-table-geometry]")';
  const label = scope === 'point' ? 'Punkter' : 'Ledninger';
  await browser.waitFor(table);
  await browser.evaluate(`Array.from(${table}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)}).click()`);
  const row = `${table}.querySelector('[data-table-row="${Number(index)}"]')`;
  await browser.waitFor(row);
  await browser.evaluate(`${row}.click()`);
}

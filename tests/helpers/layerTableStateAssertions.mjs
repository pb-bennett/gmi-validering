import assert from 'node:assert/strict';

/** Inspect the actual cells: sticky surfaces must be opaque, including during real pointer hover. */
export async function assertTableRowFill(browser, rowExpression, { selected, active, hover = true }) {
  const inspect = () => browser.evaluate(`(() => {
    const row = ${rowExpression}, root = getComputedStyle(document.documentElement);
    const color = token => { const e = document.createElement('span'); e.style.color = root.getPropertyValue(token); document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
    return { selected: row.getAttribute('aria-selected'), active: row.getAttribute('aria-current'),
      checked: row.querySelector('input[type=checkbox]')?.checked, height: row.getBoundingClientRect().height,
      accent: row.querySelector('input') && getComputedStyle(row.querySelector('input')).accentColor,
      teal: color('--gmi-interactive'), fill: color('--gmi-cyan-soft'),
      cells: [...row.children].map(e => ({ bg: getComputedStyle(e).backgroundColor,
        sticky: getComputedStyle(e).position === 'sticky', width: e.getBoundingClientRect().width,
        status: e.style.backgroundColor || null })),
      bar: [...row.children].some(e => getComputedStyle(e).boxShadow.includes('inset')) };
  })()`);
  const check = async () => {
    const state = await inspect();
    assert.equal(state.selected, String(selected));
    assert.equal(state.active, active ? 'true' : null);
    assert.equal(state.checked, selected);
    assert.equal(state.height, 28);
    assert.equal(state.cells[0].width, 32);
    assert.equal(state.accent, state.teal);
    assert(state.cells.some(c => c.sticky));
    assert(state.cells.some(c => !c.sticky));
    for (const cell of state.cells) {
      if (cell.status) assert(['rgb(254, 242, 242)', 'rgb(255, 251, 235)', 'rgb(240, 253, 244)'].includes(cell.status), 'existing contextual status fill');
      assert.equal(cell.bg, cell.status || state.fill);
    }
    if (active) assert(state.bar, 'active object keeps its inset marker');
  };
  await check();
  if (!hover) return;
  const points = await browser.evaluate(`(() => { const r = ${rowExpression}, g = r.closest('[role=grid]').getBoundingClientRect(); return [...r.children].map(e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; }).filter(p => p.x > g.left && p.x < g.right); })()`);
  for (const point of points) {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await check();
  }
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
}

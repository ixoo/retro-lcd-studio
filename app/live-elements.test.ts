import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ballBitmap,
  clampFramePosition,
  createMotionState,
  formatLiveCalendar,
  formatLiveClock,
  frameCollides,
  stepBall,
  stepMouse,
  type LiveBallElement,
  type LiveMouseElement,
} from './live-elements.ts';

const bounds = { width: 24, height: 12 };

void test('clock and calendar formats are stable', () => {
  const date = new Date(2026, 8, 3, 23, 7, 9);
  assert.match(formatLiveClock(date, '24-short'), /23:07/);
  assert.match(formatLiveClock(date, '12-seconds'), /11:07:09/);
  assert.equal(formatLiveCalendar(date, 'iso'), '2026-09-03');
  assert.equal(formatLiveCalendar(date, 'day-first'), '03/09/2026');
  assert.equal(formatLiveCalendar(date, 'month-first'), '09/03/2026');
});

void test('mouse motion remains inside the bitmap rectangle', () => {
  const element: LiveMouseElement = {
    id: 'mouse', type: 'mouse', enabled: true, row: 0, column: 0,
    shape: 'arrow', pattern: 'bounce', scale: 100, speed: 30,
  };
  const rows = ['11', '11'];
  let state = createMotionState(0, 0);
  for (let index = 0; index < 200; index += 1) {
    state = stepMouse(element, state, rows, 0.05, bounds);
    assert.ok(state.row >= 0 && state.row <= bounds.height - rows.length);
    assert.ok(state.column >= 0 && state.column <= bounds.width - rows[0].length);
  }
});

void test('ball movement substeps and bounces before a solid obstacle', () => {
  const element: LiveBallElement = {
    id: 'ball', type: 'ball', enabled: true, row: 3, column: 3, size: 1, speed: 20,
  };
  const state = { ...createMotionState(3, 3), velocityRow: 0, velocityColumn: 1 };
  const next = stepBall(element, state, ['1'], 0.5, bounds, (_row, column) => column === 7);
  assert.ok(next.column < 7);
  assert.ok(next.velocityColumn < 0);
});

void test('collision and clamping use active sprite cells and bitmap bounds', () => {
  assert.equal(frameCollides(['01'], 2, 3, bounds, (row, column) => row === 2 && column === 4), true);
  assert.deepEqual(clampFramePosition(['111', '111'], 99, -5, bounds), { row: 10, column: 0 });
  assert.deepEqual(ballBitmap(4).length, 5);
});

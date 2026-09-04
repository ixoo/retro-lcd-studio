import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ballBitmap,
  clampFramePosition,
  createMotionState,
  cursorLayers,
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
    shape: 'arrow', pattern: 'bounce', scale: 100, invertBorder: false, speed: 30,
  };
  const rows = ['11', '11'];
  let state = createMotionState(0, 0);
  for (let index = 0; index < 200; index += 1) {
    state = stepMouse(element, state, rows, 0.05, bounds);
    assert.ok(state.row >= 0 && state.row <= bounds.height - rows.length);
    assert.ok(state.column >= 0 && state.column <= bounds.width - rows[0].length);
  }
});

void test('human cursor motion picks destinations and pauses after arrival', () => {
  const element: LiveMouseElement = {
    id: 'human', type: 'mouse', enabled: true, row: 2, column: 2,
    shape: 'arrow', pattern: 'human', scale: 100, invertBorder: false, speed: 100,
  };
  const rows = ['1'];
  const start = createMotionState(2, 2, 42);
  const arrived = stepMouse(element, start, rows, 1, bounds);
  assert.ok(arrived.pauseRemaining > 0);
  assert.notDeepEqual([arrived.row, arrived.column], [start.row, start.column]);
  const paused = stepMouse(element, arrived, rows, 0.1, bounds);
  assert.equal(paused.row, arrived.row);
  assert.equal(paused.column, arrived.column);
  assert.ok(paused.pauseRemaining < arrived.pauseRemaining);
});

void test('human cursor motion decelerates near its destination', () => {
  const element: LiveMouseElement = {
    id: 'human-easing', type: 'mouse', enabled: true, row: 1, column: 1,
    shape: 'arrow', pattern: 'human', scale: 100, invertBorder: false, speed: 2,
  };
  const base = {
    ...createMotionState(1, 1, 7),
    targetRow: 1,
    targetColumn: 11,
    humanStartDistance: 10,
  };
  const early = stepMouse(element, base, ['1'], 0.1, bounds);
  const earlyDistance = early.column - base.column;
  const near = { ...base, column: 10 };
  const late = stepMouse(element, near, ['1'], 0.1, bounds);
  const lateDistance = late.column - near.column;
  assert.ok(earlyDistance > lateDistance);
  assert.ok(lateDistance > 0);
});

void test('human cursor starts faster for a more distant target', () => {
  const element: LiveMouseElement = {
    id: 'human-distance', type: 'mouse', enabled: true, row: 1, column: 1,
    shape: 'arrow', pattern: 'human', scale: 100, invertBorder: false, speed: 2,
  };
  const base = createMotionState(1, 1, 11);
  const shortState = {
    ...base,
    targetRow: 1,
    targetColumn: 4,
    humanStartDistance: 3,
  };
  const longState = {
    ...base,
    targetRow: 1,
    targetColumn: 20,
    humanStartDistance: 19,
  };
  const shortMove = stepMouse(element, shortState, ['1'], 0.1, bounds).column - base.column;
  const longMove = stepMouse(element, longState, ['1'], 0.1, bounds).column - base.column;
  assert.ok(longMove > shortMove);
});

void test('cursor border inversion separates edge and interior pixels', () => {
  const layers = cursorLayers(['111', '111', '111'], true);
  assert.deepEqual(layers.rows, ['000', '010', '000']);
  assert.deepEqual(layers.invertedRows, ['111', '101', '111']);
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

export type ClockFormat = '24-short' | '24-seconds' | '12-short' | '12-seconds';
export type CalendarFormat = 'iso' | 'day-first' | 'month-first' | 'month-name' | 'weekday';
export type CursorShapeId = 'arrow' | 'hand' | 'crosshair' | 'hourglass';
export type CursorPatternId = 'bounce' | 'horizontal' | 'vertical' | 'perimeter' | 'wander';

type LiveElementBase = {
  id: string;
  enabled: boolean;
  row: number;
  column: number;
};

export type LiveClockElement = LiveElementBase & {
  type: 'clock';
  format: ClockFormat;
  fontId: string;
  size: number;
};

export type LiveCalendarElement = LiveElementBase & {
  type: 'calendar';
  format: CalendarFormat;
  fontId: string;
  size: number;
};

export type LiveMouseElement = LiveElementBase & {
  type: 'mouse';
  shape: CursorShapeId;
  pattern: CursorPatternId;
  speed: number;
};

export type LiveBallElement = LiveElementBase & {
  type: 'ball';
  size: number;
  speed: number;
};

export type LiveElement = LiveClockElement | LiveCalendarElement | LiveMouseElement | LiveBallElement;

export type LiveSpriteFrame = {
  id: string;
  rows: string[];
  row: number;
  column: number;
};

export type LiveMotionState = {
  row: number;
  column: number;
  velocityRow: number;
  velocityColumn: number;
  phase: number;
  randomState: number;
  turnIn: number;
};

export type LiveBounds = { width: number; height: number };

export const CURSOR_SHAPES: Array<{ id: CursorShapeId; label: string; rows: string[] }> = [
  {
    id: 'arrow',
    label: 'Arrow',
    rows: ['1000000', '1100000', '1110000', '1111000', '1111100', '1111110', '1110000', '1011000', '0011000', '0001100'],
  },
  {
    id: 'hand',
    label: 'Hand',
    rows: ['0010000', '0010000', '0010110', '0011111', '1011111', '1111111', '0111111', '0111110', '0011100'],
  },
  {
    id: 'crosshair',
    label: 'Crosshair',
    rows: ['0001000', '0001000', '0001000', '1110111', '0000000', '1110111', '0001000', '0001000', '0001000'],
  },
  {
    id: 'hourglass',
    label: 'Hourglass',
    rows: ['1111111', '0111110', '0011100', '0001000', '0011100', '0110110', '1111111'],
  },
];

export const CURSOR_PATTERNS: Array<{ id: CursorPatternId; label: string }> = [
  { id: 'bounce', label: 'Bounce' },
  { id: 'horizontal', label: 'Horizontal scan' },
  { id: 'vertical', label: 'Vertical scan' },
  { id: 'perimeter', label: 'Perimeter' },
  { id: 'wander', label: 'Random wander' },
];

export const CLOCK_FORMATS: Array<{ id: ClockFormat; label: string }> = [
  { id: '24-short', label: '23:59' },
  { id: '24-seconds', label: '23:59:59' },
  { id: '12-short', label: '11:59 PM' },
  { id: '12-seconds', label: '11:59:59 PM' },
];

export const CALENDAR_FORMATS: Array<{ id: CalendarFormat; label: string }> = [
  { id: 'iso', label: '2026-09-03' },
  { id: 'day-first', label: '03/09/2026' },
  { id: 'month-first', label: '09/03/2026' },
  { id: 'month-name', label: 'Sep 3, 2026' },
  { id: 'weekday', label: 'Thu, Sep 3' },
];

export function formatLiveClock(date: Date, format: ClockFormat) {
  const includeSeconds = format === '24-seconds' || format === '12-seconds';
  const hour12 = format === '12-short' || format === '12-seconds';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12,
  }).format(date);
}

export function formatLiveCalendar(date: Date, format: CalendarFormat) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (format === 'iso') return `${year}-${month}-${day}`;
  if (format === 'day-first') return `${day}/${month}/${year}`;
  if (format === 'month-first') return `${month}/${day}/${year}`;
  if (format === 'weekday') {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function ballBitmap(size: number) {
  const diameter = Math.max(1, Math.min(15, Math.round(size) | 1));
  const radius = diameter / 2;
  return Array.from({ length: diameter }, (_, row) => (
    Array.from({ length: diameter }, (_, column) => {
      const x = column + 0.5 - radius;
      const y = row + 0.5 - radius;
      return x * x + y * y <= radius * radius ? '1' : '0';
    }).join('')
  ));
}

export function createMotionState(row: number, column: number, seed = 1): LiveMotionState {
  return {
    row,
    column,
    velocityRow: 0.62,
    velocityColumn: 0.78,
    phase: 0,
    randomState: seed || 1,
    turnIn: 0.8,
  };
}

function reflected(value: number, velocity: number, maximum: number) {
  if (maximum <= 0) return { value: 0, velocity: Math.abs(velocity) };
  let next = value;
  let nextVelocity = velocity;
  while (next < 0 || next > maximum) {
    if (next < 0) {
      next = -next;
      nextVelocity = Math.abs(nextVelocity);
    } else {
      next = maximum * 2 - next;
      nextVelocity = -Math.abs(nextVelocity);
    }
  }
  return { value: next, velocity: nextVelocity };
}

function nextRandom(state: number) {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
}

export function stepMouse(
  element: LiveMouseElement,
  state: LiveMotionState,
  rows: string[],
  deltaSeconds: number,
  bounds: LiveBounds,
) {
  const maximumRow = Math.max(0, bounds.height - rows.length);
  const maximumColumn = Math.max(0, bounds.width - (rows[0]?.length ?? 1));
  const distance = element.speed * deltaSeconds;
  const next = { ...state };

  if (element.pattern === 'perimeter') {
    const perimeter = Math.max(1, 2 * (maximumColumn + maximumRow));
    next.phase = (next.phase + distance) % perimeter;
    const phase = next.phase;
    if (phase <= maximumColumn) {
      next.column = phase;
      next.row = 0;
    } else if (phase <= maximumColumn + maximumRow) {
      next.column = maximumColumn;
      next.row = phase - maximumColumn;
    } else if (phase <= maximumColumn * 2 + maximumRow) {
      next.column = maximumColumn - (phase - maximumColumn - maximumRow);
      next.row = maximumRow;
    } else {
      next.column = 0;
      next.row = maximumRow - (phase - maximumColumn * 2 - maximumRow);
    }
    return next;
  }

  if (element.pattern === 'horizontal') {
    const horizontal = reflected(next.column + Math.sign(next.velocityColumn || 1) * distance, next.velocityColumn || 1, maximumColumn);
    next.column = horizontal.value;
    next.velocityColumn = horizontal.velocity;
    next.row = Math.min(maximumRow, Math.max(0, element.row));
    return next;
  }

  if (element.pattern === 'vertical') {
    const vertical = reflected(next.row + Math.sign(next.velocityRow || 1) * distance, next.velocityRow || 1, maximumRow);
    next.row = vertical.value;
    next.velocityRow = vertical.velocity;
    next.column = Math.min(maximumColumn, Math.max(0, element.column));
    return next;
  }

  if (element.pattern === 'wander') {
    next.turnIn -= deltaSeconds;
    if (next.turnIn <= 0) {
      next.randomState = nextRandom(next.randomState);
      const angle = next.randomState / 0xffff_ffff * Math.PI * 2;
      next.velocityColumn = Math.cos(angle);
      next.velocityRow = Math.sin(angle);
      next.randomState = nextRandom(next.randomState);
      next.turnIn = 0.45 + next.randomState / 0xffff_ffff * 1.1;
    }
  }

  const horizontal = reflected(next.column + next.velocityColumn * distance, next.velocityColumn, maximumColumn);
  const vertical = reflected(next.row + next.velocityRow * distance, next.velocityRow, maximumRow);
  next.column = horizontal.value;
  next.velocityColumn = horizontal.velocity;
  next.row = vertical.value;
  next.velocityRow = vertical.velocity;
  return next;
}

export function frameCells(frame: LiveSpriteFrame) {
  const cells: Array<[number, number]> = [];
  frame.rows.forEach((row, rowOffset) => {
    for (let columnOffset = 0; columnOffset < row.length; columnOffset += 1) {
      if (row[columnOffset] === '1') cells.push([frame.row + rowOffset, frame.column + columnOffset]);
    }
  });
  return cells;
}

export function frameContains(frame: LiveSpriteFrame, row: number, column: number) {
  const localRow = row - frame.row;
  const localColumn = column - frame.column;
  return localRow >= 0 && localColumn >= 0
    && localRow < frame.rows.length
    && localColumn < (frame.rows[localRow]?.length ?? 0)
    && frame.rows[localRow][localColumn] === '1';
}

export function frameCollides(
  rows: string[],
  row: number,
  column: number,
  bounds: LiveBounds,
  isBlocked: (row: number, column: number) => boolean,
) {
  for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < (rows[rowOffset]?.length ?? 0); columnOffset += 1) {
      if (rows[rowOffset][columnOffset] !== '1') continue;
      const targetRow = Math.round(row) + rowOffset;
      const targetColumn = Math.round(column) + columnOffset;
      if (targetRow < 0 || targetColumn < 0 || targetRow >= bounds.height || targetColumn >= bounds.width) return true;
      if (isBlocked(targetRow, targetColumn)) return true;
    }
  }
  return false;
}

export function stepBall(
  element: LiveBallElement,
  state: LiveMotionState,
  rows: string[],
  deltaSeconds: number,
  bounds: LiveBounds,
  isBlocked: (row: number, column: number) => boolean,
) {
  const next = { ...state };
  const stepCount = Math.max(1, Math.ceil(element.speed * deltaSeconds / 0.25));
  const distance = element.speed * deltaSeconds / stepCount;

  for (let step = 0; step < stepCount; step += 1) {
    const candidateColumn = next.column + next.velocityColumn * distance;
    if (frameCollides(rows, next.row, candidateColumn, bounds, isBlocked)) {
      next.velocityColumn *= -1;
    } else {
      next.column = candidateColumn;
    }

    const candidateRow = next.row + next.velocityRow * distance;
    if (frameCollides(rows, candidateRow, next.column, bounds, isBlocked)) {
      next.velocityRow *= -1;
    } else {
      next.row = candidateRow;
    }
  }
  return next;
}

export function clampFramePosition(rows: string[], row: number, column: number, bounds: LiveBounds) {
  return {
    row: Math.min(Math.max(0, bounds.height - rows.length), Math.max(0, Math.round(row))),
    column: Math.min(Math.max(0, bounds.width - (rows[0]?.length ?? 1)), Math.max(0, Math.round(column))),
  };
}

export function findNearestFreePosition(
  rows: string[],
  preferredRow: number,
  preferredColumn: number,
  bounds: LiveBounds,
  isBlocked: (row: number, column: number) => boolean,
) {
  const start = clampFramePosition(rows, preferredRow, preferredColumn, bounds);
  const limit = Math.max(bounds.width, bounds.height);
  for (let radius = 0; radius <= limit; radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== radius) continue;
        const candidate = clampFramePosition(rows, start.row + rowOffset, start.column + columnOffset, bounds);
        if (!frameCollides(rows, candidate.row, candidate.column, bounds, isBlocked)) return candidate;
      }
    }
  }
  return null;
}

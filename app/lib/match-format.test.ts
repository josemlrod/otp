import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { countdown, ordinal, soon, day, time, shortDate, today } from './match-format.ts';

import { NOW } from '../fixtures/builders.ts';
const clock = { now: NOW, timeZone: 'UTC' };
const later = (ms: number) => new Date(NOW + ms);
const HOUR = 3_600_000;

describe('match format', () => {
  it('counts down in days and hours, or hours and minutes on the day', () => {
    assert.deepEqual(countdown(later(2 * 24 * HOUR + 4 * HOUR), clock), [[2, 'd'], [4, 'h']]);
    assert.deepEqual(countdown(later(5 * HOUR + 30 * 60_000), clock), [[5, 'h'], [30, 'm']]);
    assert.deepEqual(countdown(later(-HOUR), clock), [[0, 'h'], [0, 'm']]);
  });

  it('leads a row with days, or hours on the day', () => {
    assert.equal(soon(later(3 * 24 * HOUR + HOUR), clock), '3d');
    assert.equal(soon(later(20 * HOUR), clock), '20h');
  });

  it('writes league positions as ordinals', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), [
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ]);
  });
});

it('formats midnight boundaries and today in an explicit timezone', () => {
  const date = new Date(NOW + 11.5 * HOUR);
  const madrid = { now: date.getTime(), timeZone: 'Europe/Madrid' };
  assert.equal(day(date, clock), 'Sun');
  assert.equal(time(date, clock), '23:30');
  assert.equal(shortDate(date, clock), '8 Nov');
  assert.equal(day(date, madrid), 'Mon');
  assert.equal(time(date, madrid), '00:30');
  assert.equal(shortDate(date, madrid), '9 Nov');
  assert.equal(today(madrid), 'Monday 9 November');
});

import type { Handle } from 'remix/component';
import { countRender } from '../actions/public/perf/renders.ts';

// The app mark: centre circle, halfway line, and the ball on the spot.
// Mirrors public/favicon.svg (heavier strokes than the home-screen icon so it
// holds up at header and tab sizes). public/icon.svg is the full-bleed master.
export function Logo(handle: Handle<{ size?: number }>) {
  return () => {
    countRender('Logo');
    let { size = 30 } = handle.props;

    return (
      <svg
        viewBox='0 0 512 512'
        width={size}
        height={size}
        aria-hidden='true'
        style={{ display: 'block', flex: 'none' }}
      >
        <defs>
          <linearGradient id='otp-logo-tile' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#1b1e21' />
            <stop offset='1' stopColor='#0a0b0c' />
          </linearGradient>
        </defs>
        <rect width='512' height='512' rx='154' fill='url(#otp-logo-tile)' />
        <g stroke='#f3f4f5' strokeWidth='30' fill='none'>
          <line x1='0' y1='256' x2='512' y2='256' />
          <circle cx='256' cy='256' r='128' />
        </g>
        <circle cx='256' cy='256' r='40' fill='#c5f74f' />
      </svg>
    );
  };
}

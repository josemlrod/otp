import type { Handle } from 'remix/component';
import { countRender } from '../actions/public/perf/renders.ts';
import { space, v } from './theme.ts';

export function Logo(handle: Handle<{ size?: string }>) {
  return () => {
    countRender('Logo');
    let { size = space(7.5) } = handle.props;

    return (
      <svg
        viewBox='0 0 512 512'
        aria-hidden='true'
        style={{ width: size, height: size, flex: 'none' }}
      >
        <defs>
          <linearGradient id='otp-logo-tile' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' style={{ stopColor: v('--color-surface-raised') }} />
            <stop offset='1' style={{ stopColor: v('--color-bg') }} />
          </linearGradient>
        </defs>
        <rect width='512' height='512' rx='154' fill='url(#otp-logo-tile)' />
        <g strokeWidth='30' fill='none' style={{ stroke: v('--color-text') }}>
          <line x1='0' y1='256' x2='512' y2='256' />
          <circle cx='256' cy='256' r='128' />
        </g>
        <circle cx='256' cy='256' r='40' style={{ fill: v('--color-accent') }} />
      </svg>
    );
  };
}

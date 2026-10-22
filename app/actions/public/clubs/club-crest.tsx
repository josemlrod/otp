import { css, type Handle } from 'remix/component';

import { v } from '../../../ui/theme.ts';

type Props = {
  crest: string;
  size: string;
};

export function ClubCrest(handle: Handle<Props>) {
  return () => {
    const { crest, size } = handle.props;

    return (
      <span mix={plateStyles} style={{ '--crest-size': size }} data-club-crest>
        {crest && <img src={crest} alt='' loading='lazy' mix={imageStyles} />}
      </span>
    );
  };
}

const plateStyles = css({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--crest-size)',
  height: 'var(--crest-size)',
  borderRadius: v('--radius-full'),
  background: v('--color-crest-plate'),
  boxShadow: v('--shadow-crest'),
});

const imageStyles = css({
  width: '64%',
  height: '64%',
  objectFit: 'contain',
});

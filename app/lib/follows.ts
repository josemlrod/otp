export const FOLLOWS_COOKIE = 'otp_follows';
export const FAVOURITES = 4;

const FOLLOWS_MAX_AGE_S = 400 * 24 * 60 * 60;

export function parseFollows(value: string | null | undefined): number[] {
  if (!value) return [];
  const ids = value.split('.').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

export function followsCookie(ids: number[]) {
  return `${FOLLOWS_COOKIE}=${ids.join('.')}; Path=/; Max-Age=${FOLLOWS_MAX_AGE_S}; SameSite=Lax`;
}

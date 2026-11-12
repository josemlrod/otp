export const YOUR_CLUBS_COOKIE = 'otp_follows';

const YOUR_CLUBS_MAX_AGE_S = 400 * 24 * 60 * 60;

export function parseYourClubsCookie(value: string | null | undefined): number[] {
  if (!value) return [];
  const ids = value.split('.').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

export function yourClubsCookie(ids: number[]) {
  return `${YOUR_CLUBS_COOKIE}=${ids.join('.')}; Path=/; Max-Age=${YOUR_CLUBS_MAX_AGE_S}; SameSite=Lax`;
}

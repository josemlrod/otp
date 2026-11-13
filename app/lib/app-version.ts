type Environment = {
  APP_VERSION?: string;
  FLY_IMAGE_REF?: string;
};

/**
 * Names the deploy this server runs. An installed PWA compares it with the version its page
 * was rendered with, so a new deploy can offer an update.
 *
 * CI passes the commit SHA as APP_VERSION. Fly's image ref is the fallback, because it changes
 * on every deploy but not when a stopped machine starts again. Local servers read 'dev'.
 */
export function appVersionFromEnv(env: Environment): string {
  return env.APP_VERSION?.trim() || env.FLY_IMAGE_REF?.trim() || 'dev';
}

export const APP_VERSION = appVersionFromEnv(process.env);

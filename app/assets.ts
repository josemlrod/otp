import { createAssetServer } from 'remix/assets';
import { componentHmr } from 'remix/component-hmr/assets';

const rootDir = process.cwd();
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDevelopment = nodeEnv === 'development';
const isHmr = Boolean(isDevelopment && process.env.REMIX_NODE_HMR);
const HMR_PROXY_PATH_REACHABLE_FROM_LAN = '/hmr';

async function createLanReachableHmrChannel() {
  const { createBrowserHmrChannel } = await import('remix/node-hmr/runtime');
  return { ...(await createBrowserHmrChannel()), url: HMR_PROXY_PATH_REACHABLE_FROM_LAN };
}

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir,

  allowFiles: [
    'app/routes.ts',
    'app/**/public/**',
    'app/lib/competition-metadata.ts',
    'app/ui/logo.tsx',
  ],
  allowPackages: ['remix'],
  denyFiles: ['app/**/*.test.*'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  watch: isDevelopment,
  hmr: isHmr
    ? {
        channel: createLanReachableHmrChannel,
        moduleImporter: 'remix/multiple-import-maps-polyfill',
      }
    : undefined,
  scripts: { loaders: isHmr ? [componentHmr()] : undefined },
});

const entry = 'app/actions/public/entry.ts';

export const scriptEntry = await assets.getScriptEntry(entry);

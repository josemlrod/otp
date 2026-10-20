import { createAssetServer } from 'remix/assets';
import { componentHmr } from 'remix/component-hmr/assets';

const rootDir = process.cwd();
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDevelopment = nodeEnv === 'development';
const isHmr = Boolean(isDevelopment && process.env.REMIX_NODE_HMR);

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
        // The runner reports an absolute 127.0.0.1 URL, which a phone on the
        // LAN can't reach. hmr.ts proxies this path to the event channel, so a
        // relative URL works from any device.
        channel: async () => ({
          ...(await (await import('remix/node-hmr/runtime')).createBrowserHmrChannel()),
          url: '/hmr',
        }),
        moduleImporter: 'remix/multiple-import-maps-polyfill',
      }
    : undefined,
  scripts: { loaders: isHmr ? [componentHmr()] : undefined },
});

const entry = 'app/actions/public/entry.ts';

export const scriptEntry = await assets.getScriptEntry(entry);

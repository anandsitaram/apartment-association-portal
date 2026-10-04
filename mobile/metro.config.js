const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
// /shared is the single copy of the app's logic (calculations, formatting, roles, navigation, payment status,
// the API client, types). The web app and the API import the very same files, so Metro must be allowed to read it.
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = {
  projectRoot,
  watchFolders: [sharedRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    // Files outside /mobile must resolve react & friends from the mobile app's node_modules
    extraNodeModules: new Proxy({}, { get: (_t, name) => path.join(projectRoot, 'node_modules', String(name)) }),
    // /shared is written with ".js" specifiers ("./format.js") because the API runs them as native Node ESM.
    // Point those at the .ts sources.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('.') && moduleName.endsWith('.js') && context.originModulePath.startsWith(sharedRoot + path.sep)) {
        return context.resolveRequest(context, moduleName.slice(0, -3), platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);

const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/**
 * The Phase 0 spike reuses the built `@deepseek-ai/dsh-client-desktop-transport`
 * from the repository workspace. Metro must see and transform that package, so
 * the repo package is watched, the package name is aliased to its checkout, and
 * the app's own `@babel/runtime` is reachable from the external transform.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [path.resolve(__dirname, '..', '..', 'packages', 'client', 'desktop-transport')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      '@deepseek-ai/dsh-client-desktop-transport': path.resolve(
        __dirname,
        '..',
        '..',
        'packages',
        'client',
        'desktop-transport',
      ),
      '@babel/runtime': path.resolve(__dirname, 'node_modules', '@babel/runtime'),
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)

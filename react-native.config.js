const project = (() => {
  const fs = require('fs');
  const path = require('path');
  try {
    const {
      androidManifestPath,
      iosProjectPath,
    } = require('react-native-test-app');
    return {
      android: {
        sourceDir: path.join('example', 'android'),
        manifestPath: androidManifestPath(
          path.join(__dirname, 'example', 'android'),
        ),
      },
      ios: {
        project: iosProjectPath('example/ios'),
      },
    };
  } catch (_) {
    return undefined;
  }
})();

module.exports = {
  dependencies: {
    // Help rn-cli find and autolink this library
    'react-native-webview': {
      root: __dirname,
    },
  },
  dependency: {
    platforms: {
    },
  },
  ...(project ? { project } : undefined),
};

const fs = require('fs');
const path = require('path');

const sharedBlacklist = [
    /node_modules\/react\/dist\/.*/,
    /website\/node_modules\/.*/,
    /heapCapture\/bundle\.js/,
    /.*\/__tests__\/.*/
];

function escapeRegExp(pattern) {
    if (Object.prototype.toString.call(pattern) === '[object RegExp]') {
        return pattern.source.replace(/\//g, path.sep);
    } if (typeof pattern === 'string') {
        // eslint-disable-next-line
        const escaped = pattern.replace(/[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'); // convert the '/' into an escaped local file separator

        return escaped.replace(/\//g, `\\${path.sep}`);
    }
    throw new Error(`Unexpected blacklist pattern: ${pattern}`);
}

function blacklist(additionalBlacklist) {
    return new RegExp(
        `(${
            (additionalBlacklist || [])
                .concat(sharedBlacklist)
                .map(escapeRegExp)
                .join('|')
        })$`
    );
}


export const withRNV = (config) => {
    const rnwPath = fs.realpathSync(
        path.resolve(require.resolve('react-native-windows/package.json'), '..'),
    );

    const projectPath = process.env.RNV_PROJECT_ROOT || process.cwd();

    const watchFolders = [rnwPath, path.resolve(projectPath, 'node_modules')];

    if (process.env.RNV_IS_MONOREPO === 'true' || process.env.RNV_IS_MONOREPO === true) {
        const monoRootPath = process.env.RNV_MONO_ROOT || projectPath;
        watchFolders.push(path.resolve(monoRootPath, 'node_modules'));
        watchFolders.push(path.resolve(monoRootPath, 'packages'));
    }
    if (config?.watchFolders?.length) {
        watchFolders.push(...config.watchFolders);
    }

    const exts = process.env.RNV_EXTENSIONS || '';

    const cnf = {
        ...config,
        resolver: {
            blacklistRE: blacklist([
                // This stops "react-native run-windows" from causing the metro server to crash if its already running
                // TODO. Project name should be dynamically injected here somehow
                new RegExp(
                    `${process.env.RNV_APP_BUILD_DIR.replace(/[/\\]/g, '/')}.*`,
                ),
                // This prevents "react-native run-windows" from hitting: EBUSY: resource busy or locked, open msbuild.ProjectImports.zip
                /.*\.ProjectImports\.zip/,
                /platformBuilds\/.*/,
                /buildHooks\/.*/,
                /projectConfig\/.*/,
                /appConfigs\/.*/,
                /renative.local.*/,
                /metro.config.local.*/,
                /platformBuilds\/.*/,
                /buildHooks\/.*/,
                /projectConfig\/.*/,
                /website\/.*/,
                /appConfigs\/.*/,
                /renative.local.*/,
                /metro.config.local.*/,
            ]),
            extraNodeModules: {
                // Redirect react-native-windows to avoid symlink (metro doesn't like symlinks)
                'react-native-windows': rnwPath,
            },
        },
        transformer: {
            getTransformOptions: async () => ({
                transform: {
                    experimentalImportSupport: false,
                    inlineRequires: true,
                },
            }),
        },
        watchFolders,
        sourceExts: [...(config?.resolver?.sourceExts || []), ...exts.split(',')],
        projectRoot: path.resolve(projectPath)
    };

    return cnf;
};

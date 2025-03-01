const path = require('path');
const os = require('os');
const { doResolve } = require('rnv');

const _require2 = require('metro-cache');

const { FileStore } = _require2;

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


export const withRNVMetro = (config) => {
    const projectPath = process.env.RNV_PROJECT_ROOT || process.cwd();

    const watchFolders = [path.resolve(projectPath, 'node_modules')];

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
        cacheStores: [
            new FileStore({
                root: path.join(os.tmpdir(), 'metro-cache-tvos')
            })
        ],
        transformer: {
            getTransformOptions: async () => ({
                transform: {
                    // this defeats the RCTDeviceEventEmitter is not a registered callable module
                    inlineRequires: true,
                },
            }),
            assetRegistryPath: path.resolve(
                `${doResolve('react-native-tvos')}/Libraries/Image/AssetRegistry.js`
            ),
            ...config?.transformer || {},
        },
        resolver: {
            blacklistRE: blacklist([
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
            ...config?.resolver || {},
            sourceExts: [...(config?.resolver?.sourceExts || []), ...exts.split(',')],
            extraNodeModules: config?.resolver?.extraNodeModules
        },
        watchFolders,
        projectRoot: path.resolve(projectPath)
    };

    return cnf;
};

export const createEngineAlias = (customAlias) => {
    const projectPath = process.env.RNV_PROJECT_ROOT || process.cwd();
    const isMonorepo = process.env.RNV_IS_MONOREPO === 'true' || process.env.RNV_IS_MONOREPO === true;
    const rootPath = isMonorepo ? process.env.RNV_MONO_ROOT || projectPath : projectPath;
    const alias = customAlias ? { ...customAlias } : {};

    if (process.env.RNV_IS_NATIVE_TV === 'true' || process.env.RNV_IS_NATIVE_TV === true) {
        alias['react-native'] = `${rootPath}/node_modules/react-native-tvos`;
    }

    return alias;
};

export const withRNVBabel = (cnf) => {
    const plugins = cnf?.plugins || [];

    return {
        retainLines: true,
        presets: ['module:metro-react-native-babel-preset'],
        ...cnf,
        plugins: [
            [
                require.resolve('babel-plugin-module-resolver'),
                {
                    root: [process.env.RNV_MONO_ROOT || '.'],
                    alias: createEngineAlias({})
                },
            ],
            ...plugins
        ],

    };
};

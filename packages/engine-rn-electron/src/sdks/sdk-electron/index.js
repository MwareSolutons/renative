import { buildCoreWebpackProject, configureCoreWebProject, runWebpackServer } from '@rnv/sdk-webpack';
import { spawn } from 'child_process';
import path from 'path';
import { Common, Constants, EngineManager, Exec, FileUtils, Logger, PlatformManager, ProjectManager, Resolver } from 'rnv';

const { getEngineRunnerByPlatform } = EngineManager;

const { createPlatformBuild, isPlatformActive } = PlatformManager;
const { executeAsync } = Exec;
const {
    fsExistsSync,
    mkdirSync,
    writeFileSync,
    readObjectSync,
    removeDirs,
    writeCleanFile,
    copyFileSync
} = FileUtils;
const {
    getPlatformProjectDir,
    getPlatformBuildDir,
    getAppVersion,
    getAppTitle,
    getAppId,
    getAppDescription,
    getAppAuthor,
    getAppLicense,
    getConfigProp,
    checkPortInUse,
    confirmActiveBundler,
    addSystemInjects,
    waitForHost
} = Common;
const { doResolve } = Resolver;
const {
    chalk,
    logTask,
    logError,
    logWarning,
    logSuccess,
    logInfo,
} = Logger;
const {
    copyBuildsFolder,
    copyAssetsFolder
} = ProjectManager;
const {
    MACOS,
    LINUX
} = Constants;


export const configureElectronProject = async (c, exitOnFail) => {
    logTask('configureElectronProject');

    const { platform } = c;

    c.runtime.platformBuildsProjectPath = `${getPlatformProjectDir(c)}`;
    c.runtime.webpackTarget = 'electron-main';

    // If path does not exist for png, try iconset
    const iconsetPath = path.join(
        c.paths.appConfig.dir,
        `assets/${platform}/resources/AppIcon.iconset`
    );

    await copyAssetsFolder(
        c,
        platform,
        null,
        (platform === MACOS || platform === LINUX) && fsExistsSync(iconsetPath) ? _generateICNS : null
    );

    await configureCoreWebProject(c);

    await configureProject(c, exitOnFail);
    return copyBuildsFolder(c, platform);
};
const merge = require('deepmerge');

const configureProject = (c, exitOnFail) => new Promise((resolve, reject) => {
    logTask('configureProject');
    const { platform } = c;

    if (!isPlatformActive(c, platform, resolve)) return;

    const platformProjectDir = getPlatformProjectDir(c);
    const engine = getEngineRunnerByPlatform(c, c.platform);
    const platformBuildDir = getPlatformBuildDir(c);
    const bundleAssets = getConfigProp(c, platform, 'bundleAssets') === true;
    const electronConfigPath = path.join(platformBuildDir, 'electronConfig.json');
    const packagePath = path.join(platformBuildDir, 'package.json');
    // If path does not exist for png, try iconset
    const pngIconPath = path.join(
        c.paths.appConfig.dir,
        `assets/${platform}/resources/icon.png`
    );
    const appId = getAppId(c, platform);

    if (!fsExistsSync(packagePath)) {
        if (exitOnFail) {
            logWarning(
                `Your ${chalk().white(
                    platform
                )} platformBuild is misconfigured!. let's repair it.`
            );
            createPlatformBuild(c, platform)
                .then(() => configureElectronProject(c, true))
                .then(() => resolve(c))
                .catch(e => reject(e));
            return;
        }
        reject(`${packagePath} does not exist!`);
        return;
    }
    const pkgJson = path.join(engine.originalTemplatePlatformsDir, platform, 'package.json');
    const packageJson = readObjectSync(pkgJson);

    packageJson.name = `${c.runtime.appId}-${platform}`;
    packageJson.productName = `${getAppTitle(c, platform)}`;
    packageJson.version = `${getAppVersion(c, platform)}`;
    packageJson.description = `${getAppDescription(c, platform)}`;
    packageJson.author = getAppAuthor(c, platform);
    packageJson.license = `${getAppLicense(c, platform)}`;
    packageJson.main = './main.js';

    writeFileSync(packagePath, packageJson);


    let browserWindow = {
        width: 1200,
        height: 800,
        webPreferences: { nodeIntegration: true, enableRemoteModule: true, contextIsolation: false },
        icon: (platform === MACOS || platform === LINUX) && !fsExistsSync(pngIconPath)
            ? path.join(platformProjectDir, 'resources', 'icon.icns')
            : path.join(platformProjectDir, 'resources', 'icon.png')
    };
    const browserWindowExt = getConfigProp(c, platform, 'BrowserWindow');
    if (browserWindowExt) {
        browserWindow = merge(browserWindow, browserWindowExt);
    }
    const browserWindowStr = JSON.stringify(browserWindow, null, 2);
    const electronConfigExt = getConfigProp(c, platform, 'electronConfig');
    const mainInjection = electronConfigExt?.mainInjection || '';

    if (bundleAssets) {
        const injects = [
            {
                pattern: '{{PLUGIN_INJECT_BROWSER_WINDOW}}',
                override: browserWindowStr
            },
            {
                pattern: '{{PLUGIN_INJECT_ICON_LOCATION}}',
                override: browserWindow.icon
            },
            {
                pattern: '{{PLUGIN_INJECT_MAIN_PROCESS}}',
                override: mainInjection
            }
        ];

        addSystemInjects(c, injects);

        writeCleanFile(
            path.join(platformProjectDir, 'main.prod.js'),
            path.join(platformProjectDir, 'main.js'),
            injects, null, c
        );
    } else {
        const injects = [
            {
                pattern: '{{DEV_SERVER}}',
                override: `http://${c.runtime.localhost}:${c.runtime.port}`
            },
            {
                pattern: '{{PLUGIN_INJECT_BROWSER_WINDOW}}',
                override: browserWindowStr
            },
            {
                pattern: '{{PLUGIN_INJECT_ICON_LOCATION}}',
                override: browserWindow.icon
            },
            {
                pattern: '{{PLUGIN_INJECT_MAIN_PROCESS}}',
                override: mainInjection
            }
        ];

        addSystemInjects(c, injects);

        writeCleanFile(
            path.join(platformProjectDir, 'main.dev.js'),
            path.join(platformProjectDir, 'main.js'),
            injects, null, c
        );
    }

    const macConfig = {};
    if (platform === MACOS) {
        macConfig.mac = {
            entitlements: path.join(platformProjectDir, 'entitlements.mac.plist'),
            entitlementsInherit: path.join(
                platformProjectDir,
                'entitlements.mac.plist'
            ),
            hardenedRuntime: true
        };
        macConfig.mas = {
            entitlements: path.join(platformProjectDir, 'entitlements.mas.plist'),
            entitlementsInherit: path.join(
                platformProjectDir,
                'entitlements.mas.inherit.plist'
            ),
            provisioningProfile: path.join(
                platformProjectDir,
                'embedded.provisionprofile'
            ),
            hardenedRuntime: false
        };
    }

    let electronConfig = merge(
        {
            appId,
            directories: {
                app: path.join(platformBuildDir, 'build'),
                buildResources: path.join(platformProjectDir, 'resources'),
                output: path.join(platformBuildDir, 'export')
            },
            files: ['!export/*']
        },
        macConfig
    );

    if (electronConfigExt) {
        delete electronConfigExt.mainInjection;
        electronConfig = merge(electronConfig, electronConfigExt);
    }
    writeFileSync(electronConfigPath, electronConfig);

    resolve();
});

const buildElectron = async (c) => {
    logTask('buildElectron');

    await buildCoreWebpackProject(c);
    // Webpack 5 deletes build folder but does not copy package json

    const platformBuildDir = getPlatformBuildDir(c);

    // workaround: electron-builder fails export in npx mode due to trying install node_modules. we trick it not to do that
    mkdirSync(path.join(platformBuildDir, 'build', 'node_modules'));

    const packagePathSrc = path.join(platformBuildDir, 'package.json');
    const packagePathDest = path.join(platformBuildDir, 'build', 'package.json');
    copyFileSync(packagePathSrc, packagePathDest);

    const mainPathSrc = path.join(platformBuildDir, 'main.js');
    const mainPathDest = path.join(platformBuildDir, 'build', 'main.js');
    copyFileSync(mainPathSrc, mainPathDest);

    const menuPathSrc = path.join(platformBuildDir, 'contextMenu.js');
    const menuPathDest = path.join(platformBuildDir, 'build', 'contextMenu.js');
    copyFileSync(menuPathSrc, menuPathDest);

    return true;
};

const exportElectron = async (c) => {
    logTask('exportElectron');

    const platformBuildDir = getPlatformBuildDir(c);
    const buildPath = path.join(platformBuildDir, 'build', 'release');

    if (fsExistsSync(buildPath)) {
        logInfo(`exportElectron: removing old build ${buildPath}`);
        await removeDirs([buildPath]);
    }

    const execPath = path.join('node_modules', '.bin', 'electron-builder');
    let electronBuilderPath = path.join(c.paths.project.dir, execPath);
    if (!fsExistsSync(electronBuilderPath)) {
        electronBuilderPath = path.join(c.paths.project.dir, '../../', execPath);
    }
    if (!fsExistsSync(electronBuilderPath)) {
        electronBuilderPath = path.join(c.paths.project.dir, '../../../', execPath);
    }
    if (!fsExistsSync(electronBuilderPath)) {
        electronBuilderPath = 'npx electron-builder';
    }
    await executeAsync(
        c,
        `${electronBuilderPath} --config ${path.join(
            platformBuildDir,
            'electronConfig.json'
        )} --${c.platform}`
    );

    logSuccess(
        `Your Exported App is located in ${chalk().cyan(
            path.join(platformBuildDir, 'export')
        )} .`
    );
};

export const runElectron = async (c) => {
    logTask('runElectron');

    const { platform } = c;
    const { port } = c.runtime;

    // const bundleIsDev = getConfigProp(c, platform, 'bundleIsDev') === true;
    const bundleAssets = getConfigProp(c, platform, 'bundleAssets') === true;

    if (bundleAssets) {
        await buildElectron(c);
        await _runElectronSimulator(c);
    } else {
        const isPortActive = await checkPortInUse(c, platform, port);
        if (!isPortActive) {
            logInfo(
                `Your ${chalk().white(
                    platform
                )} devServer at port ${chalk().white(
                    port
                )} is not running. Starting it up for you...`
            );
            waitForHost(c, '')
                .then(() => _runElectronSimulator(c))
                .catch(logError);
            // await _runElectronSimulator(c);
            await runWebpackServer(c);
        } else {
            const resetCompleted = await confirmActiveBundler(c);
            if (resetCompleted) {
                waitForHost(c, '')
                    .then(() => _runElectronSimulator(c))
                    .catch(logError);
                // await _runElectronSimulator(c);
                await runWebpackServer(c);
            } else {
                await _runElectronSimulator(c);
            }
        }
    }
};

const _runElectronSimulator = async (c) => {
    logTask(`_runElectronSimulator:${c.platform}`);
    // const appFolder = getAppFolder(c, c.platform);
    const elc = `${doResolve('electron')}/cli.js`;
    const bundleAssets = getConfigProp(c, c.platform, 'bundleAssets') === true;
    let platformProjectDir = getPlatformProjectDir(c);

    if (bundleAssets) {
        platformProjectDir = path.join(getPlatformBuildDir(c), 'build');
    }

    const child = spawn('node', [elc, path.join(platformProjectDir, '/main.js')], {
        detached: true,
        env: process.env,
        stdio: 'inherit'
    })
        .on('close', code => process.exit(code))
        .on('error', spawnError => logError(spawnError));

    child.unref();
};

const _generateICNS = c => new Promise((resolve, reject) => {
    logTask('_generateICNS');
    const { platform } = c;

    let source;

    if (c.paths.appConfig.dirs) {
        c.paths.appConfig.dirs.forEach((v) => {
            const pf = path.join(v, `assets/${platform}/AppIcon.iconset`);
            if (fsExistsSync(pf)) {
                source = pf;
            }
        });
    } else if (c.paths.appConfig.dir) {
        source = path.join(
            c.paths.appConfig.dir,
            `assets/${platform}/AppIcon.iconset`
        );
    }

    const dest = path.join(
        getPlatformProjectDir(c),
        'resources/icon.icns'
    );

    // It's ok if icns are not generated as png is also valid https://www.electron.build/icons.html#macos
    if (!source) {
        logWarning(
            `You are missing AppIcon.iconset in ${chalk().white(
                c.paths.appConfig.dir
            )}. icon.icns will not be generated!`
        );
        resolve();
        return;
    }

    if (!fsExistsSync(source)) {
        logWarning(
            `Your app config is missing ${chalk().white(
                source
            )}. icon.icns will not be generated!`
        );
        resolve();
        return;
    }

    mkdirSync(path.join(getPlatformProjectDir(c), 'resources'));

    const p = ['--convert', 'icns', source, '--output', dest];
    try {
        executeAsync(c, `iconutil ${p.join(' ')}`);
        resolve();
    } catch (e) {
        reject(e);
    }
});

export {
    buildElectron,
    exportElectron
};

import path from 'path';
import open from 'better-opn';
import { Exec, FileUtils, Common, Logger, Constants, EngineManager, PluginManager, ProjectManager } from 'rnv';

const { executeAsync } = Exec;
const {
    checkPortInUse,
    getConfigProp,
    confirmActiveBundler,
    getPlatformBuildDir,
    getDevServerHost,
    waitForHost
} = Common;
const { fsExistsSync, writeCleanFile, copyFolderContentsRecursiveSync } = FileUtils;
const {
    chalk, logTask, logInfo, logWarning,
    logRaw, logSummary, logSuccess
} = Logger;
const { NEXT_CONFIG_NAME } = Constants;
const { generateEnvVars } = EngineManager;
const { copyAssetsFolder } = ProjectManager;

const { parsePlugins, getModuleConfigs } = PluginManager;

export const configureNextIfRequired = async (c) => {
    logTask('configureNextIfRequired');
    c.runtime.platformBuildsProjectPath = `${getPlatformBuildDir(c)}`;
    const { platformTemplatesDirs, dir } = c.paths.project;
    // const pagesDir = path.resolve(getConfigProp(c, c.platform, 'pagesDir') || 'src/app');
    // const _appFile = path.join(pagesDir, '_app.js');
    const supportFilesDir = path.join(platformTemplatesDirs[c.platform], '../../supportFiles');
    const configFile = path.join(dir, NEXT_CONFIG_NAME);

    await copyAssetsFolder(c, c.platform);

    const destPath = path.join(c.paths.project.dir, 'public');

    if (c.paths.appConfig.dirs) {
        c.paths.appConfig.dirs.forEach((v) => {
            const sourcePath = path.join(v, `assets/${c.platform}`);
            copyFolderContentsRecursiveSync(sourcePath, destPath);
        });
    } else {
        const sourcePath = path.join(
            c.paths.appConfig.dir,
            `assets/${c.platform}`
        );
        copyFolderContentsRecursiveSync(sourcePath, destPath);
    }



    // add config
    if (!fsExistsSync(configFile)) {
        writeCleanFile(path.join(supportFilesDir, NEXT_CONFIG_NAME), configFile, null, null, c);
    }
};

export const runWebNext = async (c) => {
    const { port } = c.runtime;
    logTask('runWebNext', `port:${port}`);
    const { platform } = c;

    const devServerHost = getDevServerHost(c);

    const isPortActive = await checkPortInUse(c, platform, port);
    const bundleAssets = getConfigProp(c, c.platform, 'bundleAssets', false);

    if (!isPortActive) {
        logInfo(
            `Your ${chalk().white(platform)} devServerHost ${
                chalk().white(devServerHost)} at port ${chalk().white(
                port
            )} is not running. Starting it up for you...`
        );
        await _runWebBrowser(c, platform, devServerHost, port, false);

        if (!bundleAssets) {
            logSummary('BUNDLER STARTED');
        }
        await runWebDevServer(c);
    } else {
        const resetCompleted = await confirmActiveBundler(c);

        if (resetCompleted) {
            await _runWebBrowser(c, platform, devServerHost, port, false);
            if (!bundleAssets) {
                logSummary('BUNDLER STARTED');
            }
            await runWebDevServer(c);
        } else {
            await _runWebBrowser(c, platform, devServerHost, port, true);
        }
    }
};

const _runWebBrowser = (c, platform, devServerHost, port, alreadyStarted) => new Promise((resolve) => {
    logTask(
        '_runWebBrowser', `ip:${devServerHost} port:${port} openBrowser:${!!c.runtime.shouldOpenBrowser}`
    );
    if (!c.runtime.shouldOpenBrowser) return resolve();
    const wait = waitForHost(c, '')
        .then(() => {
            open(`http://${devServerHost}:${port}/`);
        })
        .catch((e) => {
            logWarning(e);
        });
    if (alreadyStarted) return wait; // if it's already started, return the promise so it rnv will wait, otherwise it will exit before opening the browser
    return resolve();
});

const getOutputDir = (c) => {
    const distDir = getConfigProp(c, c.platform, 'outputDir');
    return distDir || `platformBuilds/${c.runtime.appId}_${c.platform}/.next`;
};

const getExportDir = (c) => {
    const outputDir = getConfigProp(c, c.platform, 'exportDir');
    return outputDir || path.join(getPlatformBuildDir(c), 'output');
};

const _checkPagesDir = async (c) => {
    const pagesDir = getConfigProp(c, c.platform, 'pagesDir');
    const distDir = getOutputDir(c);
    if (pagesDir) {
        const pagesDirPath = path.join(c.paths.project.dir, pagesDir);
        if (!fsExistsSync(pagesDirPath)) {
            logWarning(`You configured custom ${c.platform}pagesDir: ${
                chalk().white(pagesDir)
            } in your renative.json but it is missing at ${chalk().red(pagesDirPath)}`);
        }
        return { NEXT_PAGES_DIR: pagesDir, NEXT_DIST_DIR: distDir };
    }
    const fallbackPagesDir = 'src/app';
    logWarning(`You're missing ${c.platform}.pagesDir config. Defaulting to '${fallbackPagesDir}'`);

    const fallbackPagesDirPath = path.join(c.paths.project.dir, fallbackPagesDir);
    if (!fsExistsSync(fallbackPagesDirPath)) {
        logWarning(`Folder ${
            chalk().white(fallbackPagesDir)
        } is missing. make sure your entry code is located there in order for next to work correctly!
Alternatively you can configure custom entry folder via ${c.platform}.pagesDir in renative.json`);
    }
    return { NEXT_PAGES_DIR: 'src/app', NEXT_DIST_DIR: distDir };
};

export const getTranspileModules = (c) => {
    const transModules = getConfigProp(c, c.platform, 'webpackConfig', {}).nextTranspileModules || [];

    parsePlugins(c, c.platform, (plugin, pluginPlat, key) => {
        const webpackConfig = plugin.webpack || plugin.webpackConfig;
        if (webpackConfig) {
            transModules.push(key);
            if (webpackConfig.nextTranspileModules?.length) {
                webpackConfig.nextTranspileModules.forEach((module) => {
                    if (module.startsWith('.')) {
                        transModules.push(path.join(c.paths.project.dir, module));
                    } else {
                        transModules.push(module);
                    }
                });
            }
        }
    }, true);
    return transModules;
};

export const buildWebNext = async (c) => {
    logTask('buildWebNext');
    const env = getConfigProp(c, c.platform, 'environment');

    const envExt = await _checkPagesDir(c);

    await executeAsync(c, 'npx next build', {
        ...process.env,
        env: {
            NODE_ENV: env || 'development',
            ...envExt,
            ...generateEnvVars(c, getModuleConfigs(c, 'engine-rn-next'), getTranspileModules(c))
        }
    });
    logSuccess(
        `Your build is located in ${chalk().cyan(getOutputDir(c))} .`
    );
    return true;
};

export const runWebDevServer = async (c) => {
    logTask('runWebDevServer');
    const env = getConfigProp(c, c.platform, 'environment');
    const envExt = await _checkPagesDir(c);

    const devServerHost = getDevServerHost(c);

    const url = chalk().cyan(`http://${devServerHost}:${c.runtime.port}`);
    logRaw(`

Dev server running at: ${url}

`);


    const bundleAssets = getConfigProp(c, c.platform, 'bundleAssets', false);
    return executeAsync(c, `npx next ${bundleAssets ? 'start' : 'dev'} --port ${c.runtime.port}`,
        {
            env: {
                NODE_ENV: env || 'development',
                ...envExt,
                ...generateEnvVars(c, getModuleConfigs(c, 'engine-rn-next'), getTranspileModules(c))
            },
            interactive: true
        });
};

export const deployWebNext = () => {
    logTask('deployWebNext');
    // const { platform } = c;

    // DEPRECATED: custom deployers moved to external packages
    // return selectWebToolAndDeploy(c, platform);

    return true;
};

export const exportWebNext = async (c) => {
    logTask('exportWebNext');
    // const { platform } = c;

    logTask('_exportNext');
    const exportDir = getExportDir(c);
    const env = getConfigProp(c, c.platform, 'environment');
    const envExt = await _checkPagesDir(c);

    await executeAsync(c, `npx next export --outdir ${exportDir}`, {
        ...process.env,
        env: {
            NODE_ENV: env || 'development',
            ...envExt,
            ...generateEnvVars(c, getModuleConfigs(c, 'engine-rn-next'), getTranspileModules(c))
        }
    });
    logSuccess(
        `Your export is located in ${chalk().cyan(exportDir)} .`
    );

    // DEPRECATED: custom deployers moved to external packages
    // await selectWebToolAndExport(c, platform);
    return true;
};

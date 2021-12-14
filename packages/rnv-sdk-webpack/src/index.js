
import { Common, Logger, PlatformManager, ProjectManager } from 'rnv';

import { buildCoreWebpackProject, configureCoreWebProject, runWebpackServer, waitForUrl, waitForWebpack } from '@rnv/sdk-webpack';

const { getPlatformProjectDir } = Common;
const { isPlatformActive } = PlatformManager;
const { logTask } = Logger;
const { copyBuildsFolder, copyAssetsFolder } = ProjectManager;

export {
    buildCoreWebpackProject, configureCoreWebProject, runWebpackServer, waitForUrl, waitForWebpack
};

export const buildWeb = async c => buildCoreWebpackProject(c);

export const configureWebProject = async (c) => {
    logTask('configureWebProject');

    const { platform } = c;

    c.runtime.platformBuildsProjectPath = getPlatformProjectDir(c);

    if (!isPlatformActive(c, platform)) return;

    await copyAssetsFolder(c, platform);
    await configureCoreWebProject(c);

    return copyBuildsFolder(c, platform);
};

// CHROMECAST

export const configureChromecastProject = async (c) => {
    logTask(`configureChromecastProject:${c.platform}`);

    c.runtime.platformBuildsProjectPath = `${getPlatformProjectDir(c)}`;

    await copyAssetsFolder(c, c.platform);
    await configureCoreWebProject(c);
    await _configureProject(c);
    return copyBuildsFolder(c, c.platform);
};

const _configureProject = async (c) => {
    logTask(`_configureProject:${c.platform}`);
};

export const runChromecast = async (c) => {
    logTask(`runChromecast:${c.platform}`);
    await runWebpackServer(c);
};

export const deployWeb = () => {
    logTask('deployWeb');
    // const { platform } = c;

    // DEPRECATED: custom deployers moved to external packages
    // return selectWebToolAndDeploy(c, platform);

    return true;
};

export const exportWeb = () => {
    logTask('exportWeb');
    // const { platform } = c;

    // DEPRECATED: custom deployers moved to external packages
    // return selectWebToolAndExport(c, platform);
    return true;
};

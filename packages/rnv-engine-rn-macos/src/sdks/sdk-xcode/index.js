import child_process from 'child_process';
import crypto from 'crypto';
import inquirer from 'inquirer';
import path from 'path';
import { Common, Constants, EngineManager, Exec, FileUtils, Logger, PlatformManager, ProjectManager, Resolver } from 'rnv';
import { getAppFolderName } from './common';
import {
    parseEntitlementsPlist, parseExportOptionsPlist,
    parseInfoPlist
} from './plistParser';
import { parsePodFile } from './podfileParser';
import { parseAppDelegate } from './objcParser';
import { parseXcodeProject } from './xcodeParser';
import { parseXcscheme } from './xcschemeParser';
import { parseStoryboard } from './storyboardParser';

const {
    fsExistsSync,
    mkdirSync,
    writeFileSync,
    fsWriteFileSync,
    fsReadFileSync
} = FileUtils;
const { executeAsync, commandExistsSync } = Exec;
const {
    getAppFolder,
    getConfigProp,
    getIP,
} = Common;
const { generateEnvVars } = EngineManager;
const { doResolve } = Resolver;
const { isPlatformActive } = PlatformManager;
const {
    copyAssetsFolder,
    copyBuildsFolder,
} = ProjectManager;

const { MACOS } = Constants;
const {
    chalk,
    logInfo,
    logTask,
    logError,
    logWarning,
    logDebug,
    logSuccess,
    logRaw
} = Logger;

export const generateChecksum = (str, algorithm, encoding) => crypto
    .createHash(algorithm || 'md5')
    .update(str, 'utf8')
    .digest(encoding || 'hex');

const checkIfPodsIsRequired = async (c) => {
    const appFolder = getAppFolder(c, c.platform);
    const podChecksumPath = path.join(appFolder, 'Podfile.checksum');
    if (!fsExistsSync(podChecksumPath)) return true;
    const podChecksum = fsReadFileSync(podChecksumPath).toString();
    const podContentChecksum = generateChecksum(
        fsReadFileSync(path.join(appFolder, 'Podfile')).toString()
    );

    if (podChecksum !== podContentChecksum) {
        logDebug('runCocoaPods:isMandatory');
        return true;
    }
    logInfo(
        'Pods do not seem like they need to be updated. If you want to update them manually run the same command with "-u" parameter'
    );
    return false;
};

const updatePodsChecksum = (c) => {
    logTask('updatePodsChecksum');
    const appFolder = getAppFolder(c, c.platform);
    const podChecksumPath = path.join(appFolder, 'Podfile.checksum');
    const podContentChecksum = generateChecksum(
        fsReadFileSync(path.join(appFolder, 'Podfile')).toString()
    );
    if (fsExistsSync(podChecksumPath)) {
        const existingContent = fsReadFileSync(podChecksumPath).toString();
        if (existingContent !== podContentChecksum) {
            logDebug(`updatePodsChecksum:${podContentChecksum}`);
            return fsWriteFileSync(podChecksumPath, podContentChecksum);
        }
        return true;
    }
    logDebug(`updatePodsChecksum:${podContentChecksum}`);
    return fsWriteFileSync(podChecksumPath, podContentChecksum);
};

const runCocoaPods = async (c) => {
    logTask('runCocoaPods', `forceUpdate:${!!c.program.updatePods}`);

    const appFolder = getAppFolder(c);

    if (!fsExistsSync(appFolder)) {
        return Promise.reject(`Location ${appFolder} does not exists!`);
    }
    const podsRequired = c.program.updatePods || (await checkIfPodsIsRequired(c));

    if (podsRequired) {
        if (!commandExistsSync('pod')) {
            throw new Error(
                'Cocoapods not installed. Please run `sudo gem install cocoapods`'
            );
        }

        try {
            await executeAsync(c, 'pod install', {
                cwd: appFolder,
                env: process.env
            });
        } catch (e) {
            const s = e?.toString ? e.toString() : '';
            const isGenericError = s.includes('No provisionProfileSpecifier configured')
                || s.includes('TypeError:')
                || s.includes('ReferenceError:')
                || s.includes('find gem cocoapods');
            if (isGenericError) { return new Error(`pod install failed with:\n ${s}`); }
            logWarning(
                `pod install is not enough! Let's try pod update! Error:\n ${s}`
            );
            return executeAsync(c, 'pod update', {
                cwd: appFolder,
                env: process.env
            })
                .then(() => updatePodsChecksum(c))
                .catch(er => Promise.reject(er));
        }

        updatePodsChecksum(c);
        return true;
    }
};

const copyAppleAssets = (c, platform, appFolderName) => new Promise((resolve) => {
    logTask('copyAppleAssets');
    if (!isPlatformActive(c, platform, resolve)) return;

    const appFolder = getAppFolder(c);

    // ASSETS
    fsWriteFileSync(path.join(appFolder, 'main.jsbundle'), '{}');
    mkdirSync(path.join(appFolder, 'assets'));
    mkdirSync(path.join(appFolder, `${appFolderName}/images`));

    resolve();
});

export const runXcodeProject = async (c) => {
    logTask('runXcodeProject');

    const appPath = getAppFolder(c, c.platform);
    const scheme = getConfigProp(c, c.platform, 'scheme');
    const runScheme = getConfigProp(c, c.platform, 'runScheme');
    const bundleIsDev = getConfigProp(c, c.platform, 'bundleIsDev') === true;
    const bundleAssets = getConfigProp(c, c.platform, 'bundleAssets') === true;

    if (!scheme) {
        return Promise.reject(
            `Missing scheme in platforms.${chalk().yellow(
                c.platform
            )} in your ${chalk().white(
                c.paths.appConfig.config
            )}! Check example config for more info:  ${chalk().grey(
                'https://github.com/renative-org/renative/blob/master/appConfigs/helloworld/renative.json'
            )} `
        );
    }

    if (bundleAssets) {
        return packageBundleForXcode(c, bundleIsDev)
            .then(() => _checkLockAndExec(c, appPath, scheme, runScheme));
    }
    return _checkLockAndExec(c, appPath, scheme, runScheme);
};

const _checkLockAndExec = async (c, appPath, scheme, runScheme) => {
    logTask('_checkLockAndExec', `scheme:${scheme} runScheme:${runScheme}`);
    const args = [
        path.join(doResolve('react-native-macos'), 'local-cli', 'cli.js'),
        'run-macos',
        '--project-path',
        appPath,
        '--scheme',
        scheme,
        '--configuration',
        runScheme,
    ];
    try {
        // Inherit full logs
        // return executeAsync(c, cmd, { stdio: 'inherit', silent: true });
        return executeAsync('node', {
            rawCommand: {
                args
            },
            env: generateEnvVars(c)
        });
    } catch (e) {
        if (e && e.includes) {
            const isDevelopmentTeamMissing = e.includes(
                'requires a development team. Select a development team'
            );
            if (isDevelopmentTeamMissing) {
                const loc = `./appConfigs/${
                    c.runtime.appId
                }/renative.json:{ "platforms": { "${c.platform}": { "teamID": "....."`;
                logError(e);
                logWarning(`You need specify the development team if you want to run app on ${
                    c.platform
                } device. this can be set manually in ${chalk().white(loc)}
  You can find correct teamID in the URL of your apple developer account: ${chalk().white(
        'https://developer.apple.com/account/#/overview/YOUR-TEAM-ID'
    )}`);
                const { confirm } = await inquirer.prompt({
                    name: 'confirm',
                    message: `Type in your Apple Team ID to be used (will be saved to ${c.paths.appConfig?.config})`,
                    type: 'input'
                });
                if (confirm) {
                    await _setDevelopmentTeam(c, confirm);
                    return Promise.reject('Updated. Re-run your last command');
                    // TODO: Tot picking up if re-run from here. forcing users to do it themselves for now
                    // await configureXcodeProject(c, c.platform);
                    // return runXcodeProject(c);
                }
            }
            const isAutomaticSigningDisabled = e.includes(
                'Automatic signing is disabled and unable to generate a profile'
            );
            if (isAutomaticSigningDisabled) {
                return _handleProvisioningIssues(
                    c,
                    e,
                    "Your macOS App Development provisioning profiles don't match. under manual signing mode"
                );
            }
            const isProvisioningMissing = e.includes(
                'requires a provisioning profile'
            );
            if (isProvisioningMissing) {
                return _handleProvisioningIssues(
                    c,
                    e,
                    'Your macOS App requires a provisioning profile'
                );
            }
        }

        return Promise.reject(`${e}

${chalk().green('SUGGESTION:')}

${chalk().yellow('STEP 1:')}
Open xcode workspace at: ${chalk().white(`${appPath}/RNVAppMACOS.xcworkspace`)}

${chalk().yellow('STEP 2:')}
${chalk().white('Run app and observe any extra errors')}

${chalk().yellow('IF ALL HOPE IS LOST:')}
Raise new issue and copy this SUMMARY box output at:
${chalk().white('https://github.com/renative-org/renative/issues')}
and we will try to help!

`);
    }
};

const _handleProvisioningIssues = async (c, e, msg) => {
    const provisioningStyle = getConfigProp(c, c.platform, 'provisioningStyle');
    // Sometimes xcodebuild reports Automatic signing is disabled but it could be keychain not accepted by user
    const isProvAutomatic = provisioningStyle === 'Automatic';
    const proAutoText = isProvAutomatic
        ? ''
        : `${chalk().white('[4]>')} Switch to automatic signing for appId: ${
            c.runtime.appId
        } , platform: ${c.platform}, scheme: ${c.runtime.scheme}`;
    const fixCommand = `rnv crypto updateProfile -p ${c.platform} -s ${c.runtime.scheme}`;
    const workspacePath = chalk().white(
        `${getAppFolder(c, c.platform)}/RNVAppMACOS.xcworkspace`
    );
    logError(e);
    logWarning(`${msg}. To fix try:
${chalk().white(
        '[1]>'
    )} Configure your certificates, provisioning profiles correctly manually
${chalk().white('[2]>')} Try to generate matching profiles with ${chalk().white(
    fixCommand
)} (you need correct priviledges in apple developer portal)
${chalk().white(
        '[3]>'
    )} Open generated project in Xcode: ${
    workspacePath
} and debug from there (Sometimes this helps for the first-time builds)
${proAutoText}`);
    if (isProvAutomatic) return false;
    const { confirmAuto } = await inquirer.prompt({
        name: 'confirmAuto',
        message: 'Switch to automatic signing?',
        type: 'confirm'
    });
    if (confirmAuto) {
        await _setAutomaticSigning(c);
        return Promise.reject('Updated. Re-run your last command');
        // TODO: Tot picking up if re-run from here. forcing users to do it themselves for now
        // await configureXcodeProject(c, c.platform);
        // return runXcodeProject(c);
    }
};

const _setAutomaticSigning = async (c) => {
    logTask(`_setAutomaticSigning:${c.platform}`);

    const scheme = c.files.appConfig?.config?.platforms?.[c.platform]?.buildSchemes?.[
            c.runtime.scheme
        ];
    if (scheme) {
        scheme.provisioningStyle = 'Automatic';
        writeFileSync(c.paths.appConfig.config, c.files.appConfig.config);
        logSuccess(`Succesfully updated ${c.paths.appConfig.config}`);
    } else {
        return Promise.reject(
            `Failed to update ${c.paths.appConfig?.config}."platforms": { "${
                c.platform
            }": { buildSchemes: { "${c.runtime.scheme}" ... Object is null. Try update file manually`
        );
    }
};

const _setDevelopmentTeam = async (c, teamID) => {
    logTask(`_setDevelopmentTeam:${teamID}`);

    const plat = c.files.appConfig?.config?.platforms?.[c.platform];
    if (plat) {
        plat.teamID = teamID;
        writeFileSync(c.paths.appConfig.config, c.files.appConfig.config);
        logSuccess(`Succesfully updated ${c.paths.appConfig.config}`);
    } else {
        return Promise.reject(
            `Failed to update ${c.paths.appConfig?.config}."platforms": { "${
                c.platform
            }" ... Object is null. Try update file manually`
        );
    }
};

const composeXcodeArgsFromCLI = (string) => {
    const spacesReplaced = string.replace(
        /\s(?=(?:[^'"`]*(['"`])[^'"`]*\1)*[^'"`]*$)/g,
        '&&&'
    ); // replaces spaces outside quotes with &&& for easy split
    const keysAndValues = spacesReplaced.split('&&&');
    const unescapedValues = keysAndValues.map(s => s
        .replace(/'/g, '')
        .replace(/"/g, '')
        .replace(/\\/g, '')); // removes all quotes or backslashes

    return unescapedValues;
};

export const buildXcodeProject = async (c) => {
    logTask('buildXcodeProject');

    const { platform } = c;

    const appFolderName = getAppFolderName(c, platform);
    const runScheme = getConfigProp(c, platform, 'runScheme', 'Debug');

    let destinationPlatform = '';
    switch (c.platform) {
        case MACOS: {
            destinationPlatform = 'macOS';
            break;
        }
        default:
            logError(`platform ${c.platform} not supported`);
    }

    const scheme = getConfigProp(c, platform, 'scheme');
    const appPath = getAppFolder(c);
    const buildPath = path.join(appPath, `build/${scheme}`);
    const allowProvisioningUpdates = getConfigProp(
        c,
        platform,
        'allowProvisioningUpdates',
        true
    );
    const ignoreLogs = getConfigProp(c, platform, 'ignoreLogs');
    let ps = '';
    if (c.program.xcodebuildArgs) {
        ps = c.program.xcodebuildArgs;
    }
    const p = [];

    if (!ps.includes('-workspace')) {
        p.push('-workspace');
        p.push(`${appPath}/${appFolderName}.xcworkspace`);
    }
    if (!ps.includes('-scheme')) {
        p.push('-scheme');
        p.push(scheme);
    }
    if (!ps.includes('-configuration')) {
        p.push('-configuration');
        p.push(runScheme);
    }
    if (!ps.includes('-derivedDataPath')) {
        p.push('-derivedDataPath');
        p.push(buildPath);
    }
    if (!ps.includes('-destination')) {
        p.push('-destination');
        p.push(`platform=${destinationPlatform}`);
    }

    p.push('build');

    if (allowProvisioningUpdates && !ps.includes('-allowProvisioningUpdates')) { p.push('-allowProvisioningUpdates'); }
    if (ignoreLogs && !ps.includes('-quiet')) p.push('-quiet');

    logTask('buildXcodeProject', 'STARTING xcodebuild BUILD...');

    if (c.buildConfig.platforms[platform].runScheme === 'Release') {
        await executeAsync(c, `xcodebuild ${ps} ${p.join(' ')}`);
        logSuccess(
            `Your Build is located in ${chalk().cyan(buildPath)} .`
        );
    }

    const args = ps !== '' ? [...composeXcodeArgsFromCLI(ps), ...p] : p;

    logDebug('xcodebuild args', args);

    return executeAsync('xcodebuild', { rawCommand: { args } }).then(() => {
        logSuccess(`Your Build is located in ${chalk().cyan(buildPath)} .`);
    });
};

const archiveXcodeProject = (c) => {
    logTask('archiveXcodeProject');
    const { platform } = c;

    const appFolderName = getAppFolderName(c, platform);
    const runScheme = getConfigProp(c, platform, 'runScheme', 'Debug');
    let sdk = getConfigProp(c, platform, 'sdk');
    if (!sdk) {
        if (platform === MACOS) sdk = 'macosx';
    }
    const sdkArr = [sdk];

    const appPath = getAppFolder(c);
    const exportPath = path.join(appPath, 'release');

    const scheme = getConfigProp(c, platform, 'scheme');
    const allowProvisioningUpdates = getConfigProp(
        c,
        platform,
        'allowProvisioningUpdates',
        true
    );
    const ignoreLogs = getConfigProp(c, platform, 'ignoreLogs');
    const exportPathArchive = `${exportPath}/${scheme}.xcarchive`;
    let ps = '';
    if (c.program.xcodebuildArchiveArgs) {
        ps = c.program.xcodebuildArchiveArgs;
    }
    const p = [];

    if (!ps.includes('-workspace')) {
        p.push('-workspace');
        p.push(`${appPath}/${appFolderName}.xcworkspace`);
    }
    if (!ps.includes('-scheme')) {
        p.push('-scheme');
        p.push(scheme);
    }
    if (!ps.includes('-sdk')) {
        p.push('-sdk');
        p.push(...sdkArr);
    }
    if (!ps.includes('-configuration')) {
        p.push('-configuration');
        p.push(runScheme);
    }
    p.push('archive');
    if (!ps.includes('-archivePath')) {
        p.push('-archivePath');
        p.push(exportPathArchive);
    }

    if (allowProvisioningUpdates && !ps.includes('-allowProvisioningUpdates')) { p.push('-allowProvisioningUpdates'); }
    if (ignoreLogs && !ps.includes('-quiet')) p.push('-quiet');

    logTask('archiveXcodeProject', 'STARTING xcodebuild ARCHIVE...');


    const args = ps !== '' ? [...composeXcodeArgsFromCLI(ps), ...p] : p;

    logDebug('xcodebuild args', args);

    return executeAsync('xcodebuild', { rawCommand: { args } }).then(() => {
        logSuccess(`Your Archive is located in ${chalk().cyan(exportPath)} .`);
    });
};

const exportXcodeProject = async (c) => {
    logTask('exportXcodeProject');

    const { platform } = c;

    await archiveXcodeProject(c);

    const appPath = getAppFolder(c);
    const exportPath = path.join(appPath, 'release');

    const scheme = getConfigProp(c, platform, 'scheme');
    const allowProvisioningUpdates = getConfigProp(
        c,
        platform,
        'allowProvisioningUpdates',
        true
    );
    const ignoreLogs = getConfigProp(c, platform, 'ignoreLogs');

    let ps = '';
    if (c.program.xcodebuildExportArgs) {
        ps = c.program.xcodebuildExportArgs;
    }
    const p = ['-exportArchive'];

    if (!ps.includes('-archivePath')) {
        p.push(`-archivePath ${exportPath}/${scheme}.xcarchive`);
    }
    if (!ps.includes('-exportOptionsPlist')) {
        p.push(`-exportOptionsPlist ${appPath}/exportOptions.plist`);
    }
    if (!ps.includes('-exportPath')) {
        p.push(`-exportPath ${exportPath}`);
    }

    if (allowProvisioningUpdates && !ps.includes('-allowProvisioningUpdates')) { p.push('-allowProvisioningUpdates'); }
    if (ignoreLogs && !ps.includes('-quiet')) p.push('-quiet');

    logDebug('running', p);

    logTask('exportXcodeProject', 'STARTING xcodebuild EXPORT...');

    return executeAsync(c, `xcodebuild ${p.join(' ')}`).then(() => {
        logSuccess(`Your export is located in ${chalk().cyan(exportPath)} .`);
    });
};

export const packageBundleForXcode = (c, isDev = false) => {
    logTask('packageBundleForXcode');
    const appFolder = getAppFolder(c);
    // const { maxErrorLength } = c.program;
    const args = [
        'bundle',
        '--platform',
        'macos',
        '--dev',
        isDev,
        '--assets-dest',
        appFolder,
        '--entry-file',
        `${c.buildConfig.platforms[c.platform].entryFile}.js`,
        '--bundle-output',
        `${appFolder}/main.jsbundle`,
        '--config=metro.config.rnm.js'
    ];

    if (getConfigProp(c, c.platform, 'enableSourceMaps', false)) {
        args.push('--sourcemap-output');
        args.push(`${appFolder}/main.jsbundle.map`);
    }

    if (c.program.info) {
        args.push('--verbose');
    }

    return executeAsync('node', {
        rawCommand: {
            args: [
                path.join(doResolve(
                    'react-native'
                ), 'local-cli', 'cli.js'),
                ...args,
            ]
        },
        env: generateEnvVars(c)
    });
};

// Resolve or reject will not be called so this will keep running
const runAppleLog = c => new Promise(() => {
    logTask('runAppleLog');
    const filter = c.program.filter || 'RNV';
    const child = child_process.execFile(
        'xcrun',
        [
            'simctl',
            'spawn',
            'booted',
            'log',
            'stream',
            '--predicate',
            `eventMessage contains "${filter}"`
        ],
        { stdio: 'inherit', customFds: [0, 1, 2] }
    );
        // use event hooks to provide a callback to execute when data are available:
    child.stdout.on('data', (data) => {
        const d = data.toString();
        if (d.toLowerCase().includes('error')) {
            logRaw(chalk().red(d));
        } else if (d.toLowerCase().includes('success')) {
            logRaw(chalk().green(d));
        } else {
            logRaw(d);
        }
    });
});

const configureXcodeProject = async (c) => {
    logTask('configureXcodeProject');
    const { device } = c.program;
    const { platform } = c;
    const bundlerIp = device ? getIP() : 'localhost';
    const appFolder = getAppFolder(c);
    c.runtime.platformBuildsProjectPath = `${appFolder}/RNVAppMACOS.xcworkspace`;
    const appFolderName = getAppFolderName(c, platform);
    const bundleAssets = getConfigProp(c, platform, 'bundleAssets') === true;
    // INJECTORS
    c.pluginConfigiOS = {
        podfileInject: '',
        podPostInstall: '',
        staticPodExtraConditions: '',
        staticFrameworks: [],
        staticPodDefinition: '',
        exportOptions: '',
        embeddedFonts: [],
        embeddedFontSources: [],
        ignoreProjectFonts: [],
        pluginAppDelegateImports: '',
        pluginAppDelegateMethods: '',
        appDelegateMethods: {
            application: {
                didFinishLaunchingWithOptions: [],
                applicationDidBecomeActive: [],
                open: [],
                supportedInterfaceOrientationsFor: [],
                didReceiveRemoteNotification: [],
                didFailToRegisterForRemoteNotificationsWithError: [],
                didReceive: [],
                didRegister: [],
                didRegisterForRemoteNotificationsWithDeviceToken: [],
                continue: []
            },
            userNotificationCenter: {
                willPresent: []
            }
        },
        podfileSources: []
    };

    const subPath = 'RNVAppMACOS';
    await copyAssetsFolder(c, platform, subPath);
    await copyAppleAssets(c, platform, appFolderName);
    await parseAppDelegate(
        c,
        platform,
        appFolder,
        appFolderName,
        bundleAssets,
        bundlerIp
    );
    await parseStoryboard(c, platform, appFolder, appFolderName);
    await parseExportOptionsPlist(c, platform);
    await parseXcscheme(c, platform);
    await parsePodFile(c, platform);
    await parseEntitlementsPlist(c, platform);
    await parseInfoPlist(c, platform);
    await copyBuildsFolder(c, platform);
    await parseXcodeProject(c, platform);
    await runCocoaPods(c);
    return true;
};

export {
    runCocoaPods,
    copyAppleAssets,
    configureXcodeProject,
    exportXcodeProject,
    archiveXcodeProject,
    runAppleLog
};

import inquirer from 'inquirer';
import path from 'path';
import { logDebug, logHook } from '../systemManager/logger';
import { executeAsync } from '../systemManager/exec';
import { fsExistsSync, copyFolderContentsRecursiveSync } from '../systemManager/fileutils';
import { getConfigProp } from '../common';
import { doResolve } from '../systemManager/resolve';

export const executePipe = async (c, key) => {
    logHook('executePipe', `('${key}')`);

    const pipesConfig = c.buildConfig?.pipes;
    if (!pipesConfig || (pipesConfig && pipesConfig.includes(key))) {
        await buildHooks(c);
    }

    const pipe = c.buildPipes ? c.buildPipes[key] : null;

    if (Array.isArray(pipe)) {
        await pipe.reduce(
            (accumulatorPromise, next) => {
                logHook(`buildHook.${next?.name}`, '(EXECUTING)');
                return accumulatorPromise.then(() => next(c));
            },
            Promise.resolve()
        );
    } else if (pipe) {
        logHook(`buildHook.${pipe?.name}`, '(EXECUTING)');
        await pipe(c);
    }
};

/* eslint-disable import/no-dynamic-require, global-require */
export const buildHooks = async (c) => {
    logDebug('buildHooks');

    const enableHookRebuild = getConfigProp(c, c.platform, 'enableHookRebuild');

    const shouldBuildHook = c.program.reset || c.program.resetHard
    || !fsExistsSync(c.paths.buildHooks.dist.dir) || enableHookRebuild === true;


    if (!fsExistsSync(c.paths.buildHooks.index)) {
        const { confirm } = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Build hooks not configured in this project. Configure?'
        });
        if (confirm) {
            copyFolderContentsRecursiveSync(
                path.join(c.paths.rnv.dir, 'projectTemplate/buildHooks/src'),
                c.paths.buildHooks.dir
            );
        }
    }

    // New projects are not ready to compile babel
    if (!c.files.project.config.isNew && doResolve('@babel/cli')) {
        if (shouldBuildHook && !c.isBuildHooksReady) {
            try {
                logHook('buildHooks', 'Build hooks not complied. BUILDING...');
                await executeAsync(
                    c,
                    `babel ${c.paths.buildHooks.dir} -d ${c.paths.buildHooks.dist.dir}`,
                    { cwd: c.paths.project.dir, silent: true }
                );
            } catch (e) {
                // Fail Builds instead of warn when hook fails
                return Promise.reject(`BUILD_HOOK Failed with error: ${e}`);
            }
        }

        const h = require(c.paths.buildHooks.dist.index);
        c.buildHooks = h.hooks;
        c.buildPipes = h.pipes;
        c.isBuildHooksReady = true;
    }

    return true;
};

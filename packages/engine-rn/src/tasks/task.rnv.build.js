import { TaskManager, Constants, Logger, PlatformManager } from 'rnv';
import {
    buildAndroid,
} from '@rnv/sdk-android';
import { buildXcodeProject } from '@rnv/sdk-apple';

const { logErrorPlatform } = PlatformManager;
const { logTask } = Logger;
const {
    IOS,
    MACOS,
    ANDROID,
    ANDROID_TV,
    FIRE_TV,
    ANDROID_WEAR,
    TASK_BUILD, TASK_PACKAGE, TASK_EXPORT,
    PARAMS
} = Constants;

const { executeOrSkipTask, shouldSkipTask } = TaskManager;

export const taskRnvBuild = async (c, parentTask, originTask) => {
    logTask('taskRnvBuild');
    const { platform } = c;

    await executeOrSkipTask(c, TASK_PACKAGE, TASK_BUILD, originTask);

    if (shouldSkipTask(c, TASK_BUILD, originTask)) return true;

    switch (platform) {
        case ANDROID:
        case ANDROID_TV:
        case FIRE_TV:
        case ANDROID_WEAR:
            return buildAndroid(c);
        case IOS:
        case MACOS:
            if (parentTask === TASK_EXPORT) {
                // build task is not necessary when exporting ios
                return true;
            }
            return buildXcodeProject(c, platform);
        default:
            return logErrorPlatform(c);
    }
};

export default {
    description: 'Build project binary',
    fn: taskRnvBuild,
    task: TASK_BUILD,
    params: PARAMS.withBase(PARAMS.withConfigure()),
    platforms: [
        IOS,
        ANDROID,
        ANDROID_TV,
        ANDROID_WEAR,
        MACOS
    ],
};

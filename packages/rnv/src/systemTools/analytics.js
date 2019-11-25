import { RewriteFrames } from '@sentry/integrations';

import Config from '../config';
import pkg from '../../package.json';

class Analytics {
    constructor() {
        this.errorFixer = null;
        this.knowItAll = null;
    }

    initialize() {
        if (Config.isAnalyticsEnabled) {
            // ERROR HANDLING
            // eslint-disable-next-line global-require
            this.errorFixer = require('@sentry/node');

            this.errorFixer.init({
                dsn: 'https://004caee3caa04c81a10f2ba31a945362@sentry.io/1795473',
                release: `rnv@${pkg.version}`,
                integrations: [new RewriteFrames({
                    root: '/',
                    iteratee: (frame) => {
                        if (frame.filename.includes('rnv/dist/') || frame.filename.includes('rnv/src')) {
                            if (frame.filename.includes('rnv/dist/')) {
                                frame.filename = frame.filename.split('rnv/dist/')[1];
                            } else {
                                frame.filename = frame.filename.split('rnv/src/')[1];
                            }
                        } else if (frame.filename.includes('/node_modules/')) {
                            frame.filename = `node_modules/${frame.filename.split('/node_modules/')[1]}`;
                        }
                        return frame;
                    }
                })]
            });

            // EVENT HANDLING
            // Sentry for now
            this.knowItAll = this.errorFixer;
        }
    }

    captureException(e) {
        if (Config.isAnalyticsEnabled && this.errorFixer) {
            if (e instanceof Error) {
                this.errorFixer.captureException(e);
            } else {
                this.errorFixer.captureException(new Error(e));
            }
        }
    }

    captureEvent(e) {
        if (Config.isAnalyticsEnabled && this.knowItAll) {
            this.knowItAll.captureEvent(e);
        }
    }

    teardown() {
        return new Promise((resolve) => {
            if (Config.isAnalyticsEnabled && this.errorFixer) {
                const client = this.errorFixer.getCurrentHub().getClient();
                if (client) {
                    return client.close(2000).then(resolve);
                }
                return resolve();
            }
            return resolve();
        });
    }
}

export default new Analytics();
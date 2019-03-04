const commandLineArgs = require('command-line-args');
const { default: createLogger } = require('logging');

const benchmarkProject = require('./benchmark');

function main() {
  const args = commandLineArgs({ name: 'path', type: String, defaultOption: true });

  const logger = createLogger('appraisejs');
  logger.debug('command line argments', args);

  if (!args.path) {
    throw Error('no path specified');
  }

  if (!process.env.NODE_PATH) {
    throw Error('environment variable NODE_PATH not set');
  }

  logger.debug('NODE_PATH:', process.env.NODE_PATH);

  benchmarkProject(args.path, process.env.NODE_PATH)
    // eslint-disable-next-line
    .then(() => {
      /**
       * TODO: Store results
       */
    })
    .catch((error) => {
      throw error;
    });
}

main();

const commandLineArgs = require('command-line-args');
const { default: createLogger } = require('logging');
const requestPromise = require('request-promise-native');

const benchmarkProject = require('./benchmark');

const { NODE_PATH } = process.env;
if (!NODE_PATH) {
  throw Error('environment variable NODE_PATH not set');
}

// Send benchmark results to worker parent host
const sendResults = (results, hostPort) => (
  requestPromise({
    method: 'POST',
    uri: `http://localhost:${hostPort}/results`,
    body: results,
    json: true,
    resolveWithFullResponse: true,
  })
);

function main() {
  const args = commandLineArgs([
    { name: 'path', type: String, defaultOption: true },
    { name: 'hostPort', type: Number },
  ]);

  if (!args.path) {
    throw Error('no path specified');
  }
  if (!args.hostPort) {
    throw Error('no host port specified');
  }

  const logger = createLogger('appraisejs');

  benchmarkProject(args.path, NODE_PATH)
    .then(results => sendResults(results, args.hostPort))
    .then(({ statusCode }) => logger.info('Worker responded with status', statusCode))
    .catch((error) => {
      throw error;
    });
}

main();

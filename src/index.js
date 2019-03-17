const commandLineArgs = require('command-line-args');
const requestPromise = require('request-promise-native');

const benchmarkProject = require('./benchmark');

// Send benchmark results to worker parent host
// const sendResults = ({ errors, result: results }, hostPort) => {
//   const errorsObject = assign(...errors);
//   const { testErrors, attemptErrors } = chain(errorsObject)
//     .mapValues(stageErrors => (
//       // Convert from Error object to string
//       Array.isArray(stageErrors)
//         ? stageErrors.map(error => error.message)
//         : mapValues(stageErrors, error => error.message)
//     ))
//     .reduce(
//       (acc, stageErrors, stageName) => {
//         // Split stages
//         const type = stageName === RUN_BENCHMARKS ? 'attemptErrors' : 'testErrors';
//         acc[type][stageName] = stageErrors;
//         return acc;
//       },
//       { testErrors: {}, attemptErrors: {} },
//     )
//     .value();
//
//   const benchmarks = {
//     ...results,
//     ...attemptErrors,
//   }
//
//   return requestPromise({
//     method: 'POST',
//     uri: `http://localhost:${hostPort}/results`,
//     body,
//     json: true,
//     resolveWithFullResponse: true,
//   });
// };

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

  const { NODE_PATH } = process.env;
  if (!NODE_PATH) {
    throw Error('environment variable NODE_PATH not set');
  }

  benchmarkProject(args.path, NODE_PATH)
    // .then(results => sendResults(results, args.hostPort))
    // .then(({ statusCode }) => logger.info('Worker responded with status', statusCode))
    .catch((error) => {
      throw error;
    });
}

main();

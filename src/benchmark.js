const listModuleExports = require('list-module-exports');
const {
  assign,
  forEach,
  isEmpty,
  mapValues,
  reduce,
} = require('lodash');
const { default: createLogger } = require('logging');
const { join } = require('path');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');
const requestPromise = require('request-promise-native');

const { findFiles, stripRoot } = require('./utils/files');
const PromisePipe = require('./utils/PromisePipe');
const { runChildProcess } = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const promisePipe = new PromisePipe();

const discoverBenchmarkFiles = projectPath => findFiles(/\.benchmark.js$/, projectPath);

const getBenchmarkIdsByFile = (...args) => {
  const [filepaths, nodePath] = promisePipe.args(...args);
  const errors = [];

  // Safely list `module.exports` of a passed file
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ [filepath]: benchmarkIds }))
      .catch((error) => {
        // TODO
        // const projectPath = stripRoot(filepath, nodePath);
        const projectPath = filepath;
        errors.push(Error(`error in "${projectPath}": ${error.message}`));

        return undefined;
      }));

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then((values) => {
      // Merge each `values` object into a single object
      const result = assign({}, ...values);

      return promisePipe.return(result, errors, 'getBenchmarkIds');
    });
};

// Check that each benchmark ID is unique across all benchmark files
const filterUniqueBenchmarkIds = (...args) => {
  const [benchmarkIdsByFile, nodePath] = promisePipe.args(...args);

  // Reverse mapping of { filepath: [benchmarkId] } to { benchmarkId: [filepath] }
  const filesByBenchmarkId = reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach((benchmarkId) => {
      if (benchmarkId in acc) {
        acc[benchmarkId].push(filepath);
      } else {
        acc[benchmarkId] = [filepath];
      }
    });

    return acc;
  }, {});

  // Get unique benchmark IDs
  const { errors, unique } = reduce(
    filesByBenchmarkId,
    (acc, filepaths, benchmarkId) => {
      const count = filepaths.length;

      // Check if benchmark occurs in multiple files
      if (count === 1) {
        // Reconstruct "benchmarkIdsByFile" with just unique benchmarks
        const filepath = filepaths[0];

        if (filepath in acc.unique) {
          acc.unique[filepath].push(benchmarkId);
        } else {
          acc.unique[filepath] = [benchmarkId];
        }
      } else {
        // TODO
        // const files = filepaths.map(filepath => `"${stripRoot(filepath, nodePath)}"`).join(', ');
        const files = filepaths.map(filepath => `"${filepath}"`).join(', ');
        acc.errors.push(
          Error(`duplicate benchmark ID "${benchmarkId}" found in ${count} files: ${files}`),
        );
      }

      return acc;
    },
    { errors: [], unique: {} },
  );

  return promisePipe.return(unique, errors, 'filterUniqueBenchmarkIds');
};

const runBenchmarksInSequence = (...args) => {
  const [benchmarkIdsByFile, nodePath] = promisePipe.args(...args);
  const runnerPath = join(nodePath, 'src/runner.js');

  // Create promise-creator for each benchmark to be run
  const queue = reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach((benchmarkId) => {
      acc[benchmarkId] = () => runChildProcess(runnerPath, filepath, benchmarkId);
    });

    return acc;
  }, {});

  // Run each benchmark one-at-a-time
  return queuePromises(queue).then(({ resolved, rejected }) => (
    promisePipe.return(resolved, rejected, 'runBenchmarksInSequence')
  ));
};

const logResults = ({ errors, result }) => {
  const logger = createLogger('appraisejs:results');
  logger.debug('Benchmark results:', result);

  // Log all errors encountered along the chain
  forEach(errors, (stage) => {
    const stageName = Object.keys(stage)[0];
    const stageErrors = Object.values(stage)[0];

    if (!isEmpty(stageErrors)) {
      logger.debug(`Errors at "${stageName}":`, stageErrors);
    }
  });

  return { errors, result };
};

// Send benchmark results to worker parent host
const sendResults = ({ errors, result }, hostPort) => {
  const stringifiedErrors = errors.map((stage) => {
    const stageName = Object.keys(stage)[0];
    const stageErrors = Object.values(stage)[0];
    const stringifiedStageErrors = (
      Array.isArray(stageErrors)
        ? stageErrors.map(error => error.message)
        : mapValues(stageErrors, error => error.message)
    );

    return { [stageName]: stringifiedStageErrors };
  });

  return requestPromise({
    method: 'POST',
    uri: `http://localhost:${hostPort}/results`,
    body: {
      errors: stringifiedErrors,
      results: result,
    },
    json: true,
    resolveWithFullResponse: true,
  });
};

const benchmarkProject = (projectPath, hostPort, nodePath) => {
  const logger = createPromiseLogger('appraisejs');
  logger.debug('Finding benchmark files');

  return discoverBenchmarkFiles(projectPath)
    .then(logger.debugAwait('Getting benchmarks from files'))
    .then(results => getBenchmarkIdsByFile(results, nodePath))
    .then(logger.debugAwait('Filtering benchmarks by unique ID'))
    .then(results => filterUniqueBenchmarkIds(results, nodePath))
    .then(logger.debugAwait('Running benchmarks'))
    .then(results => runBenchmarksInSequence(results, nodePath))
    .then(results => logResults(results))
    .then(logger.debugAwait('Sending results to worker'))
    .then(results => sendResults(results, hostPort))
    .then(({ statusCode }) => logger.info('Worker responded with status', statusCode))
    .catch(error => logger.error(error));
};

module.exports = benchmarkProject;

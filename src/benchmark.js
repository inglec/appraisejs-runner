const listModuleExports = require('list-module-exports');
const _ = require('lodash');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');

const { findFiles, stripRoot } = require('./utils/files');
const PromisePipe = require('./utils/PromisePipe');
const { runChildProcess } = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const promisePipe = new PromisePipe();

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getBenchmarkIdsByFile = (...args) => {
  const [filepaths] = promisePipe.args(...args);

  const errors = [];

  // Safely list `module.exports` of a passed file
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ [filepath]: benchmarkIds }))
      .catch((error) => {
        errors.push(
          Error(`error in "${stripRoot(filepath, process.env.NODE_PATH)}": ${error.message}`),
        );

        return undefined;
      }));

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then((values) => {
      // Merge each `values` object into a single object.
      const result = _.assign({}, ...values);

      return promisePipe.return(result, errors, 'getBenchmarkIds');
    });
};

// Check that each benchmark ID is unique across all benchmark files
const filterUniqueBenchmarkIds = (...args) => {
  const [benchmarkIdsByFile] = promisePipe.args(...args);

  // Reverse mapping of { filepath: [benchmarkId] } to { benchmarkId: [filepath] }
  const filesByBenchmarkId = _.reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
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
  const { errors, unique } = _.reduce(
    filesByBenchmarkId,
    (acc, filepaths, benchmarkId) => {
      const count = filepaths.length;

      if (count === 1) {
        // Reconstruct "benchmarkIdsByFile" with just unique benchmarks.
        const filepath = filepaths[0];

        if (filepath in acc) {
          acc.unique[filepath].push(benchmarkId);
        } else {
          acc.unique[filepath] = [benchmarkId];
        }
      } else {
        const files = filepaths
          .map(filepath => `"${stripRoot(filepath, process.env.NODE_PATH)}"`)
          .join(', ');

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
  const [benchmarkIdsByFile] = promisePipe.args(...args);

  // Create promise-creator for each benchmark to be run
  const queue = _.reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach((benchmarkId) => {
      acc[benchmarkId] = () => runChildProcess(filepath, benchmarkId);
    });

    return acc;
  }, {});

  // Run each benchmark one-at-a-time
  return queuePromises(queue).then(({ resolved, rejected }) => (
    promisePipe.return(resolved, rejected, 'runBenchmarksInSequence')
  ));
};

const benchmarkProject = (rootDir) => {
  const logger = createPromiseLogger('appraisejs');

  logger.debug('Finding benchmark files');
  return discoverBenchmarkFiles(rootDir)
    .then(logger.debugAwait('Getting benchmarks from files'))
    .then(getBenchmarkIdsByFile)
    .then(logger.debugAwait('Filtering benchmarks by unique ID'))
    .then(filterUniqueBenchmarkIds)
    .then(logger.debugAwait('Running benchmarks'))
    .then(runBenchmarksInSequence)
    .then(({ errors, result }) => {
      // Log benchmark results
      logger.debug('Benchmark results:', result);

      // Log all errors encountered along the chain
      _.forEach(errors, (stage) => {
        const stageName = Object.keys(stage)[0];
        const stageErrors = Object.values(stage)[0];

        if (!_.isEmpty(stageErrors)) {
          logger.debug(`Errors at "${stageName}":`, stageErrors);
        }
      });

      return undefined;
    });
};

module.exports = benchmarkProject;

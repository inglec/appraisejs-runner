const listModuleExports = require('list-module-exports');
const {
  assign,
  forEach,
  isEmpty,
  reduce,
} = require('lodash');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');

const { findFiles, stripRoot } = require('./utils/files');
const PromisePipe = require('./utils/PromisePipe');
const { runChildProcess } = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const promisePipe = new PromisePipe();

const discoverBenchmarkFiles = projectPath => findFiles(/\.benchmark.js$/, projectPath);

const getBenchmarkIdsByFile = (...args) => {
  const [filepaths] = promisePipe.args(...args);

  const errors = [];

  // Safely list `module.exports` of a passed file
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ [filepath]: benchmarkIds }))
      .catch((error) => {
        const projectPath = stripRoot(filepath, process.env.NODE_PATH);
        errors.push(Error(`error in "${projectPath}": ${error.message}`));

        return undefined;
      }));

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then((values) => {
      // Merge each `values` object into a single object.
      const result = assign({}, ...values);

      return promisePipe.return(result, errors, 'getBenchmarkIds');
    });
};

// Check that each benchmark ID is unique across all benchmark files
const filterUniqueBenchmarkIds = (...args) => {
  const [benchmarkIdsByFile] = promisePipe.args(...args);

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

      // Check if benchmark occurs in multiple files.
      if (count === 1) {
        // Reconstruct "benchmarkIdsByFile" with just unique benchmarks.
        const filepath = filepaths[0];

        if (filepath in acc.unique) {
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
  const queue = reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
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

const benchmarkProject = (projectPath) => {
  const logger = createPromiseLogger('appraisejs');

  logger.debug('Finding benchmark files');
  return discoverBenchmarkFiles(projectPath)
    .then(logger.debugAwait('Getting benchmarks from files'))
    .then(getBenchmarkIdsByFile)
    .then(logger.debugAwait('Filtering benchmarks by unique ID'))
    .then(filterUniqueBenchmarkIds)
    .then(logger.debugAwait('Running benchmarks'))
    .then(runBenchmarksInSequence)
    .then(({ errors, result }) => {
      logger.debug('Benchmark results:', result);

      // Log all errors encountered along the chain
      forEach(errors, (stage) => {
        const stageName = Object.keys(stage)[0];
        const stageErrors = Object.values(stage)[0];

        if (!isEmpty(stageErrors)) {
          logger.debug(`Errors at "${stageName}":`, stageErrors);
        }
      });

      return undefined;
    });
};

module.exports = benchmarkProject;

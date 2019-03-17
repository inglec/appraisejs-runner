const listModuleExports = require('list-module-exports');
const { assign, isEmpty, reduce } = require('lodash');
const { default: createLogger } = require('logging');
const { join } = require('path');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');

const {
  DISCOVER_BENCHMARKS,
  RUN_BENCHMARKS,
  VERIFY_UNIQUE_BENCHMARK_IDS,
} = require('./constants/stages');
const { findFiles, stripRoot } = require('./utils/files');
const PromisePipe = require('./utils/PromisePipe');
const ChildProcess = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const promisePipe = new PromisePipe();

const discoverBenchmarkFiles = projectPath => findFiles(/\.benchmark.js$/, projectPath);

const getBenchmarkIdsByFile = (...args) => {
  const [filepaths, projectPath] = promisePipe.args(...args);
  const errors = [];

  // Safely list `module.exports` of a passed file
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ [filepath]: benchmarkIds }))
      .catch((error) => {
        const relativePath = stripRoot(filepath, projectPath);
        errors.push(Error(`error in "${relativePath}": ${error.message}`));

        return undefined;
      }));

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then((values) => {
      // Merge each `values` object into a single object
      const result = assign({}, ...values);

      return promisePipe.return(result, errors, DISCOVER_BENCHMARKS);
    });
};

// Check that each benchmark ID is unique across all benchmark files
const filterUniqueBenchmarkIds = (...args) => {
  const [benchmarkIdsByFile, projectPath] = promisePipe.args(...args);

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
        const files = filepaths.map(filepath => `"${stripRoot(filepath, projectPath)}"`).join(', ');
        acc.errors.push(
          Error(`duplicate benchmark ID "${benchmarkId}" found in ${count} files: ${files}`),
        );
      }

      return acc;
    },
    { errors: [], unique: {} },
  );

  return promisePipe.return(unique, errors, VERIFY_UNIQUE_BENCHMARK_IDS);
};

const runBenchmarksInSequence = (...args) => {
  const [benchmarkIdsByFile, nodePath] = promisePipe.args(...args);
  const runnerPath = join(nodePath, 'src/runner.js');

  // Create promise-creator for each benchmark to be run
  const queue = reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach((benchmarkId) => {
      acc[benchmarkId] = () => new ChildProcess(runnerPath, filepath, benchmarkId).await();
    });

    return acc;
  }, {});

  // Run each benchmark one-at-a-time
  return queuePromises(queue).then(({ resolved, rejected }) => (
    promisePipe.return(resolved, rejected, RUN_BENCHMARKS)
  ));
};

const transformResults = ({ errors, result }) => {
  const errorsByStage = assign(...errors);
};

const logResults = ({ errors, result }) => {
  const logger = createLogger('appraisejs:results');
  logger.debug('Benchmark results:', result);
  logger.debug('Benchmark errors:', errors);
  //
  // // Log all errors encountered along the chain
  // errors.forEach(({ errors: stageErrors, stage: stageName }) => {
  //   if (!isEmpty(stageErrors)) {
  //     logger.debug(`Errors at "${stageName}":`, stageErrors);
  //   }
  // });

  return { errors, result };
};

const benchmarkProject = (projectPath, nodePath) => {
  const logger = createPromiseLogger('appraisejs');
  logger.debug('Finding benchmark files');

  return discoverBenchmarkFiles(projectPath)
    .then(logger.debugAwait('Getting benchmarks from files'))
    .then(results => getBenchmarkIdsByFile(results, projectPath))
    .then(logger.debugAwait('Filtering benchmarks by unique ID'))
    .then(results => filterUniqueBenchmarkIds(results, projectPath))
    .then(logger.debugAwait('Running benchmarks'))
    .then(results => runBenchmarksInSequence(results, nodePath))
    // .then(results => transformResults(results))
    .then(results => logResults(results))
    .catch(error => logger.error(error));
};

module.exports = benchmarkProject;

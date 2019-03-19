const listModuleExports = require('list-module-exports');
const { reduce } = require('lodash/collection');
const { isEmpty } = require('lodash/lang');
const { assign, mapValues, pick } = require('lodash/object');
const { join } = require('path');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises, repeatWhile } = require('promise-utils');

const {
  DISCOVER_BENCHMARKS,
  RUN_BENCHMARKS,
  VERIFY_UNIQUE_BENCHMARK_IDS,
} = require('./constants/stages');
const { findFiles, stripRoot } = require('./utils/files');
const PromisePipe = require('./utils/PromisePipe');
const ChildProcess = require('./ChildProcess');
const whitelistedModules = require('./whitelisted_modules');

const logger = createPromiseLogger('appraisejs');
const promisePipe = new PromisePipe();

const discoverBenchmarkFiles = projectPath => findFiles(/\.benchmark.js$/, projectPath);


const getBenchmarkIdsByFile = async (...args) => {
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

  const values = await Promise.all(filepaths.map(getBenchmarkIds));

  // Merge each `values` object into a single object
  const result = assign({}, ...values);

  return promisePipe.return(result, errors, DISCOVER_BENCHMARKS);
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

const runBenchmarksInSequence = async (...args) => {
  const [benchmarkIdsByFile, nodePath] = promisePipe.args(...args);
  const runnerPath = join(nodePath, 'src/runner/index.js');

  // Create promise-creator for each benchmark to be run
  const queue = reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach((benchmarkId) => {
      acc[benchmarkId] = async () => {
        // Run each benchmark a number of times equal to its maximum attempts until no error occurs
        const attempts = await repeatWhile(
          () => new ChildProcess(runnerPath, filepath, benchmarkId).await(),
          (result, i) => {
            // Always run first attempt
            if (i === 0) {
              return true;
            }

            const { definition: { maxAttempts }, runs } = result;

            // If an error occurred in the last run, rerun the benchmark
            const rerun = 'error' in runs[runs.length - 1] && i < maxAttempts;
            if (rerun) {
              logger.debug('rerunning', benchmarkId, `(${i})`);
            }

            return rerun;
          },
        );

        return attempts.values();
      };
    });

    return acc;
  }, {});

  // Run each benchmark one-at-a-time
  const results = await queuePromises(queue);
  const { resolved, rejected } = results.partition();

  return promisePipe.return(resolved, rejected, RUN_BENCHMARKS);
};

const transformResults = ({ errors, result: benchmarks }, projectPath) => {
  // Convert stage-specific Error objects to strings
  const stringifiedStages = errors
    .filter(stage => !isEmpty(stage.errors))
    .map(({ errors: stageErrors, stage }) => {
      const stringifiedErrors = (
        Array.isArray(stageErrors)
          ? stageErrors.map(error => error.message)
          : mapValues(stageErrors, error => error.message)
      );

      return {
        errors: stringifiedErrors,
        stage,
      };
    });

  // Reformat test results
  const transformedBenchmarks = mapValues(benchmarks, (attempts) => {
    // Get benchmark definition and path from one of the attempts
    const { definition, filepath } = attempts[0];

    // Remove definition and filepath from each attempt
    const transformedAttempts = attempts.map(attempt => pick(attempt, 'runs'));

    return {
      attempts: transformedAttempts,
      definition,
      filepath: stripRoot(filepath, projectPath),
    };
  });

  return {
    errors: stringifiedStages,
    benchmarks: transformedBenchmarks,
  };
};

const benchmarkProject = (projectPath, nodePath) => {
  logger.debug('Finding benchmark files');

  return discoverBenchmarkFiles(projectPath)
    .then(logger.debugAwait('Getting benchmarks from files'))
    .then(results => getBenchmarkIdsByFile(results, projectPath))
    .then(logger.debugAwait('Filtering benchmarks by unique ID'))
    .then(results => filterUniqueBenchmarkIds(results, projectPath))
    .then(logger.debugAwait('Running benchmarks'))
    .then(results => runBenchmarksInSequence(results, nodePath))
    .then(results => transformResults(results, projectPath))
    .then(logger.debugId)
    .catch(error => logger.error(error));
};

module.exports = benchmarkProject;

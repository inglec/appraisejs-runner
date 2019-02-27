const listModuleExports = require('list-module-exports');
const _ = require('lodash');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');

const { findFiles } = require('./utils/files');
const { runChildProcess } = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const logger = createPromiseLogger('appraisejs');

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getBenchmarkIdsByFile = (filepaths) => {
  // Safely list `module.exports` of a passed file
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ filepath, benchmarkIds }))
      .catch(error => ({ filepath, error }))
  );

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then((values) => {
      const { resolved, rejected } = values.reduce(
        (acc, { filepath, benchmarkIds, error }) => {
          if (error) {
            acc.rejected[filepath] = error;
          } else {
            acc.resolved[filepath] = benchmarkIds;
          }
          return acc;
        },
        { resolved: {}, rejected: {} },
      );

      logger.debug('Fetched benchmark IDs:', resolved);

      // Log errors when getting `module.exports`
      _.forEach(rejected, (error, filepath) => logger.error(`Error in "${filepath}:\n"`, error));

      return resolved;
    });
};

// Check that each benchmark ID is unique across all benchmark files
const filterUniqueBenchmarkIds = (benchmarkIdsByFile) => {
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
  const unique = _.reduce(filesByBenchmarkId, (acc, filepaths, benchmarkId) => {
    const count = filepaths.length;

    if (count === 1) {
      // Reconstruct "benchmarkIdsByFile" with just unique benchmarks.
      const filepath = filepaths[0];

      if (filepath in acc) {
        acc[filepath].push(benchmarkId);
      } else {
        acc[filepath] = [benchmarkId];
      }
    } else {
      // Log duplicate benchmark IDs
      const files = filepaths.map(filepath => `"${filepath}"`).join(', ');
      logger.error(`Duplicate benchmark ID "${benchmarkId}" found in ${count} files: ${files}`);
    }

    return acc;
  }, {});

  return unique;
};

const runBenchmarksInSequence = (benchmarkIdsByFile) => {
  // Create promise-creator for each benchmark to be run
  const queue = _.reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach(benchmarkId => (
      acc.push(() => runChildProcess(filepath, benchmarkId))
    ));

    return acc;
  }, []);

  // Run each benchmark one-at-a-time
  return queuePromises(queue).then(logger.debugId);
};

const benchmarkProject = rootDir => (
  discoverBenchmarkFiles(rootDir)
    .then(getBenchmarkIdsByFile)
    .then(filterUniqueBenchmarkIds)
    .then(runBenchmarksInSequence)
);

module.exports = benchmarkProject;

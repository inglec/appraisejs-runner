const listModuleExports = require('list-module-exports');
const _ = require('lodash');
const createPromiseLogger = require('promise-logging');
const { queue: queuePromises } = require('promise-utils');

const { findFiles } = require('./utils/files');
const { awaitChildProcess, spawnChildProcess } = require('./child_process');
const whitelistedModules = require('./whitelisted_modules');

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getBenchmarkIdsByFile = (filepaths) => {
  // Safely list `module.exports` of a passed file.
  const getBenchmarkIds = filepath => (
    listModuleExports(filepath, whitelistedModules, true)
      .then(benchmarkIds => ({ filepath, benchmarkIds }))
      .catch(error => ({ filepath, error }))
  );

  return Promise
    .all(filepaths.map(getBenchmarkIds))
    .then(values => (
      // Transform array of objects into object.
      values.reduce((acc, { filepath, benchmarkIds, error }) => {
        acc[filepath] = benchmarkIds || error;

        return acc;
      }, {})
    ));
};

// Check that each benchmark ID is unique across all benchmark files.
const verifyUniqueBenchmarkIds = (benchmarkIdsByFile) => {
  // Reverse mapping of { filepath: [benchmarkId] } to { benchmarkId: [filepath] }.
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

  const duplicateBenchmarkIds = _.pickBy(filesByBenchmarkId, files => files.length > 1);

  if (_.isEmpty(duplicateBenchmarkIds)) {
    return Promise.resolve(benchmarkIdsByFile);
  }

  // Log all duplicate benchmark IDs with their filepaths.
  const error = _
    .map(duplicateBenchmarkIds, (filepaths, benchmarkId) => {
      const files = filepaths.map(filepath => `"${filepath}"`).join(', ');

      // TODO: Trim start of filepaths to only include relative paths for test directory.
      return (
        `Duplicate benchmark ID "${benchmarkId}" found in ${filepaths.length} files: ${files}`
      );
    })
    .join('\n');

  return Promise.reject(Error(error));
};

const runBenchmarksInSequence = (benchmarkIdsByFile) => {
  // Create array of { filepath, benchmarkId } objects.
  const pairs = _.reduce(benchmarkIdsByFile, (acc, benchmarkIds, filepath) => {
    benchmarkIds.forEach(benchmarkId => acc.push({ filepath, benchmarkId }));
    return acc;
  }, []);

  // Create promise-creator for each benchmark to be run.
  const queue = pairs.map(({ filepath, benchmarkId }) => (
    () => {
      const childProcess = spawnChildProcess(filepath, benchmarkId);
      return awaitChildProcess(childProcess);
    }
  ));

  // Run each benchmark one-at-a-time.
  return queuePromises(queue);
};

const benchmarkProject = (rootDir) => {
  const logger = createPromiseLogger('Benchmark');

  return discoverBenchmarkFiles(rootDir)
    .then(getBenchmarkIdsByFile)
    .then((benchmarkIdsByFile) => {
      // Split into successes and failures..
      const { resolved, rejected } = _.reduce(
        benchmarkIdsByFile,
        (acc, value, filepath) => {
          acc[value instanceof Error ? 'rejected' : 'resolved'][filepath] = value;

          return acc;
        },
        { rejected: {}, resolved: {} },
      );

      _.forEach(rejected, (error, filepath) => logger.error(filepath, error));

      return resolved;
    })
    .then(verifyUniqueBenchmarkIds)
    .then(runBenchmarksInSequence)
    .then(logger.infoId);
};

module.exports = benchmarkProject;

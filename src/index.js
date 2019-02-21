const _ = require('lodash');
const createPromiseLogger = require('promise-logging');
const promiseUtils = require('promise-utils');

const { findFiles } = require('./utils/files');
const { awaitChildProcess, spawnChildProcess } = require('./child_process');

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

// TODO: `require` is dangerous. Replace with something else.
// eslint-disable-next-line
const getBenchmarkIds = filepath => Object.keys(require(filepath));

const getBenchmarkIdsByFile = filepaths => _.zipObject(filepaths, filepaths.map(getBenchmarkIds));

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
  return promiseUtils.queue(queue);
};

const benchmarkProject = (rootDir) => {
  const logger = createPromiseLogger('Benchmark');

  return discoverBenchmarkFiles(rootDir)
    .then(getBenchmarkIdsByFile)
    .then(verifyUniqueBenchmarkIds)
    .then(runBenchmarksInSequence)
    .then(logger.infoId);
};

module.exports = benchmarkProject;

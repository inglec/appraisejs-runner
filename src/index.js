const { fork } = require('child_process');
const _ = require('lodash');
const path = require('path');
const createPromiseLogger = require('promise-logging');

const { promiseWait, promisePartition } = require('./utils/async');
const { findFiles } = require('./utils/files');

const CHILD_RUNNER_PATH = path.join(process.env.NODE_PATH, 'src', 'child_runner.js');

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

// eslint-disable-next-line
const getBenchmarkIds = filepath => Object.keys(require(filepath));

const spawnChildProcess = (filepath, benchmarkId) => (
  // Create a child node process to run a single benchmark.
  fork(CHILD_RUNNER_PATH, [`--filepath=${filepath}`, `--benchmark=${benchmarkId}`])
);

const awaitChildProcess = childProcess => (
  new Promise((resolve, reject) => {
    const onExit = event => (
      (code, signal) => {
        if (code === 0) {
          resolve({ event, code, signal });
        } else {
          reject(Error(`Event "${event}" exited with status ${code} and signal "${signal}"`));
        }
      }
    );

    childProcess
      .on('close', onExit('close'))
      .on('disconnect', () => resolve({ event: 'disconnect' }))
      .on('error', error => reject(error))
      .on('exit', onExit('exit'))
      .on('message', (message, sendHandle) => console.log(message, sendHandle));
  })
);

const benchmarkProject = (rootDir) => {
  const logger = createPromiseLogger('Benchmark');

  return discoverBenchmarkFiles(rootDir)
    .then((filepaths) => {
      const benchmarkIdsByFile = filepaths.map(getBenchmarkIds);
      return _.zip(filepaths, benchmarkIdsByFile);
    })
    .then(logger.infoId)
    .then(zipped => _.flatMap(zipped, ([filepath, benchmarkIds]) => (
      benchmarkIds.map(benchmarkId => spawnChildProcess(filepath, benchmarkId))
    )))
    .then(childProcesses => promiseWait(childProcesses, awaitChildProcess))
    .then(promisePartition)
    .then(logger.infoId)
    .then(logger.infoAwait('All done!'));
};

module.exports = benchmarkProject;

const { fork } = require('child_process');
const { default: createLogger } = require('logging');
const path = require('path');

const {
  BEGIN_BENCHMARK,
  END_BENCHMARK,
  ERROR,
  RESULT,
} = require('./message_types');

const BENCHMARK_TIMEOUT = 5000;
const CHILD_RUNNER_PATH = path.join(process.env.NODE_PATH, 'src/runner.js');

const logger = createLogger('appraisejs:child');

const spawnChildProcess = (filepath, benchmarkId) => (
  fork(CHILD_RUNNER_PATH, [`--filepath=${filepath}`, `--benchmark=${benchmarkId}`])
);

const awaitChildProcess = childProcess => (
  new Promise((resolve, reject) => {
    // Is the process still running the benchmark?
    let running = false;

    const onError = (error) => {
      running = false;
      reject(error);
    };

    const onExit = (code, signal) => {
      running = false;

      if (code !== 0) {
        let message = `Exited with code ${code}`;
        if (signal) {
          message += `, signal: ${signal}`;
        }
        reject(Error(message));
      }
    };

    const onMessage = (message) => {
      const { body, type } = message;
      const { benchmarkId, result, error: errorMessage } = body;
      const error = errorMessage ? Error(errorMessage) : undefined;

      logger.debug(benchmarkId, type, result || error);

      switch (type) {
        case BEGIN_BENCHMARK: {
          running = true;

          // Kill child process if it fails to exit within the timeout
          setTimeout(() => {
            if (running) {
              reject(Error(`timeout after ${BENCHMARK_TIMEOUT}ms`));
              childProcess.kill();
            }
          }, BENCHMARK_TIMEOUT);
          break;
        }
        case END_BENCHMARK: {
          running = false;
          break;
        }
        case ERROR: {
          running = false;
          reject(error);
          break;
        }
        case RESULT:
          resolve(result);
          break;
        default:
          reject(Error(`unmatched message type ${message}`));
      }
    };

    childProcess
      .on('error', onError)
      .on('exit', onExit)
      .on('message', onMessage);
  })
);

const runChildProcess = (filepath, benchmarkId) => (
  awaitChildProcess(spawnChildProcess(filepath, benchmarkId))
);

module.exports = { awaitChildProcess, runChildProcess, spawnChildProcess };

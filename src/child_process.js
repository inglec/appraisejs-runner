const { fork } = require('child_process');
const path = require('path');

const {
  BEGIN_BENCHMARK,
  END_BENCHMARK,
  ERROR,
  RESULT,
} = require('./message_types');

const BENCHMARK_TIMEOUT = 5000;
const CHILD_RUNNER_PATH = path.join(process.env.NODE_PATH, 'src', 'runner.js');

const spawnChildProcess = (filepath, benchmarkId) => (
  fork(CHILD_RUNNER_PATH, [
    `--filepath=${filepath}`,
    `--benchmark=${benchmarkId}`,
  ])
);

const awaitChildProcess = childProcess => (
  new Promise((resolve, reject) => {
    const onError = error => reject(error);

    const onExit = (code, signal) => {
      const result = { event: 'exit', code, signal };

      if (code === 0) {
        resolve(result);
      } else {
        reject(Error(JSON.stringify(result)));
      }
    };

    // Is the process still running the benchmark?
    let running = false;

    const onMessage = (message) => {
      switch (message.type) {
        case BEGIN_BENCHMARK: {
          running = true;

          // Kill child process if fails to exit within the timeout.
          setTimeout(() => {
            if (running) {
              reject(Error('timeout'));
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
          reject(Error(message.body));
          break;
        }
        case RESULT:
          resolve(message.body);
          break;
        default:
          reject(Error(`unmatched message type ${message}`));
      }
    };

    // Attach event handlers.
    childProcess
      .on('error', onError)
      .on('exit', onExit)
      .on('message', onMessage);
  })
);


module.exports = {
  awaitChildProcess,
  spawnChildProcess,
};

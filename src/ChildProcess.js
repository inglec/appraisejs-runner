const { fork } = require('child_process');
const { compact } = require('lodash/array');
const { default: createLogger } = require('logging');

const {
  COMPLETED,
  ERROR,
  GET_BENCHMARK_DEFINITION,
  GET_BENCHMARK_RESULTS,
  RESULT,
  RUN_BENCHMARK,
  STARTED,
  VALIDATE_BENCHMARK_DEFINITION,
  WARNING,
} = require('./constants/messages');

const GET_BENCHMARK_DEFINITION_TIMEOUT = 5000;

class ChildProcess {
  constructor(runnerPath, benchmarkPath, benchmarkId) {
    this.benchmarkId = benchmarkId;

    this.childProcess = fork(runnerPath, [
      `--filepath=${benchmarkPath}`,
      `--benchmark=${benchmarkId}`,
    ]);
    this.logger = createLogger('appraisejs:child');

    this.benchmarkDefinition = null;
    this.state = {
      stage: null,
      status: null,
      benchmark: {
        runIndex: -1,
        runs: [],
      },
    };
  }

  nextRun() {
    this.state.benchmark.runIndex += 1;
  }

  pushResult(value) {
    const { runs, runIndex } = this.state.benchmark;
    const existing = runs[runIndex];

    if (existing) {
      const string1 = typeof value === 'object' ? JSON.stringify(value) : value;
      const string2 = typeof existing === 'object' ? JSON.stringify(existing) : existing;
      throw Error(`tried to store ${string1} at index ${runIndex}, but found ${string2}`);
    } else {
      runs[runIndex] = value;
    }
  }

  await() {
    return new Promise((resolve, reject) => {
      const resolveProcess = (value) => {
        if (value) {
          this.pushResult(value);
        }

        resolve({
          definition: this.benchmarkDefinition,
          runs: this.state.benchmark.runs,
        });
      };

      const onError = (error) => {
        this.state.status = COMPLETED;
        reject(error);
      };

      const onExit = (code, signal) => {
        this.state.status = COMPLETED;

        if (code !== 0 && signal !== 'SIGTERM') {
          let message = `exited with code ${code}`;
          if (signal) {
            message += `, signal: ${signal}`;
          }
          reject(Error(message));
        }
      };

      const onMessage = ({ body, stage, status }) => {
        // Convert error messages back to errors
        const value = status === ERROR ? Error(body) : body;
        this.logger.debug(`[${this.benchmarkId}]`, `${stage}:`, status, ...compact([value]));

        this.state.stage = stage;

        switch (status) {
          case STARTED: {
            this.state.status = STARTED;

            // Kill child process if it fails to exit within the timeout
            switch (stage) {
              case GET_BENCHMARK_DEFINITION:
                setTimeout(() => {
                  if (this.state.stage === stage && this.state.status === STARTED) {
                    resolveProcess(
                      Error(`timeout after ${GET_BENCHMARK_DEFINITION_TIMEOUT}ms`),
                    );
                    this.childProcess.kill();
                  }
                }, GET_BENCHMARK_DEFINITION_TIMEOUT);
                break;
              case RUN_BENCHMARK: {
                this.nextRun();

                const { timeout } = this.benchmarkDefinition;
                setTimeout(() => {
                  if (this.state.stage === stage && this.state.status === STARTED) {
                    resolveProcess(Error(`timeout after ${timeout}ms`));
                    this.childProcess.kill();
                  }
                }, timeout);
                break;
              }
              default:
            }

            break;
          }
          case COMPLETED: {
            this.state.status = COMPLETED;

            switch (stage) {
              case GET_BENCHMARK_RESULTS:
                resolveProcess();
                break;
              default:
            }

            break;
          }
          case RESULT:
            this.state.status = COMPLETED;

            switch (stage) {
              case RUN_BENCHMARK:
                this.pushResult(value);
                break;
              case VALIDATE_BENCHMARK_DEFINITION: {
                this.benchmarkDefinition = value;
                break;
              }
              default:
            }

            break;
          case ERROR: {
            this.state.status = COMPLETED;
            resolveProcess(value);
            break;
          }
          case WARNING:
            break;
          default:
            reject(Error(`unexpected message status ${status}`));
        }
      };

      this.childProcess
        .on('error', onError)
        .on('exit', onExit)
        .on('message', onMessage);
    });
  }
}

module.exports = ChildProcess;

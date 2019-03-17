const { fork } = require('child_process');
const { compact } = require('lodash');
const { default: createLogger } = require('logging');

const {
  COMPLETED,
  ERROR,
  GET_BENCHMARK_DEFINITION,
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
    this.benchmarkDefinition = null;
    this.state = {
      stage: null,
      status: null,
      runs: {
        index: -1,
        results: [],
      },
    };

    this.childProcess = fork(runnerPath, [
      `--filepath=${benchmarkPath}`,
      `--benchmark=${benchmarkId}`,
    ]);
    this.logger = createLogger('appraisejs:child');
  }

  pushResult(result) {
    const { index, results } = this.state.runs;
    if (results[index]) {
      this.logger.error('tried to push second result', result, 'onto', results[index]);
    } else {
      results[index] = result;
    }
  }

  beginRun() {
    this.state.runs.index += 1;
  }

  await() {
    return new Promise((resolve) => {
      const resolveRunner = (result) => {
        if (result) {
          this.pushResult(result);
        }
        resolve(this.state.runs.results);
      };

      const onError = (error) => {
        this.state.status = COMPLETED;
        resolveRunner(error);
      };

      const onExit = (code, signal) => {
        this.state.status = COMPLETED;

        if (code !== 0 && signal !== 'SIGTERM') {
          let message = `exited with code ${code}`;
          if (signal) {
            message += `, signal: ${signal}`;
          }
          this.pushResult(Error(message));
        }

        resolveRunner();
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
                    resolveRunner(Error(`timeout after ${GET_BENCHMARK_DEFINITION_TIMEOUT}ms`));
                    this.childProcess.kill();
                  }
                }, GET_BENCHMARK_DEFINITION_TIMEOUT);
                break;
              case RUN_BENCHMARK: {
                this.beginRun();

                const { timeout } = this.benchmarkDefinition;
                setTimeout(() => {
                  if (this.state.stage === stage && this.state.status === STARTED) {
                    resolveRunner(Error(`timeout after ${timeout}ms`));
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
            break;
          }
          case RESULT:
            this.state.status = COMPLETED;

            switch (stage) {
              case VALIDATE_BENCHMARK_DEFINITION: {
                this.benchmarkDefinition = value;
                break;
              }
              case RUN_BENCHMARK: {
                this.pushResult(value);
                break;
              }
              default:
            }
            break;
          case ERROR: {
            this.state.status = COMPLETED;
            resolveRunner(value);
            break;
          }
          case WARNING:
            break;
          default:
            throw Error(`unexpected message status ${status}`);
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

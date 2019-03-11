const commandLineArgs = require('command-line-args');

const benchmarkProject = require('./benchmark');

function main() {
  const args = commandLineArgs([
    { name: 'path', type: String, defaultOption: true },
    { name: 'hostPort', type: Number },
  ]);

  if (!args.path) {
    throw Error('no path specified');
  }

  if (!args.hostPort) {
    throw Error('no host port specified');
  }

  if (!process.env.NODE_PATH) {
    throw Error('environment variable NODE_PATH not set');
  }

  benchmarkProject(args.path, args.hostPort, process.env.NODE_PATH)
    // eslint-disable-next-line
    .then(() => {
      /**
       * TODO: Store results
       */
    })
    .catch((error) => {
      throw error;
    });
}

main();

const commandLineArgs = require('command-line-args');

const benchmarkProject = require('./benchmark');

function main() {
  const args = commandLineArgs({ name: 'path', type: String, defaultOption: true });

  if (!args.path) {
    throw Error('no path specified');
  }

  if (!process.env.NODE_PATH) {
    throw Error('environment variable NODE_PATH not set');
  }

  benchmarkProject(args.path, process.env.NODE_PATH)
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

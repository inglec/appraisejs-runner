const commandLineArgs = require('command-line-args');

const benchmarkProject = require('./benchmark');

function main() {
  const args = commandLineArgs({ name: 'path', type: String, defaultOption: true });

  if (!args.path) {
    throw Error('no path specified');
  }

  benchmarkProject(args.path)
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

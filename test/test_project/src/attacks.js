const exitProcess = process.exit;

const infiniteLoop = () => {
  // eslint-disable-next-line no-constant-condition
  while (true);
};

const requireBlacklistedModules = () => (
  ['child_process', 'vm'].reduce((acc, blacklisted) => {
    // eslint-disable-next-line
    acc[blacklisted] = require(blacklisted);

    return acc;
  }, {})
);

module.exports = {
  exitProcess,
  infiniteLoop,
  requireBlacklistedModules,
};

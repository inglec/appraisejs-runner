const attacks = require('./attacks');

const exitProcess = {
  benchmark: attacks.exitProcess,
};

const infiniteLoop = {
  benchmark: attacks.infiniteLoop,
};

const requireBlacklistedModules = {
  benchmark: attacks.requireBlacklistedModules,
};

module.exports = {
  'attacks-exit-process': exitProcess,
  'attacks-infinite-loop': infiniteLoop,
  'attacks-require-blacklisted-modules': requireBlacklistedModules,
};

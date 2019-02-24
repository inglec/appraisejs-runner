const sync = require('./sync');

const addNumbers = {
  benchmark: () => sync.addNumbers(1, 2, 3),
};

module.exports = {
  'sync-add-numbers': addNumbers,
};

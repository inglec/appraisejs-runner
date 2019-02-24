const errors = require('./errors');

const syntaxError = {
  benchmark: () => errors.syntaxError(),
};

module.exports = { 'errors-syntax-error': syntaxError };

const TypedError = require('error/typed');

const STAGE_ERROR = 'stage';
const DELIMITER = ': ';

const StageError = TypedError({
  type: STAGE_ERROR,
  message: '{stage}: {error}',
  stage: null,
  error: null,
});

module.exports = { DELIMITER, STAGE_ERROR, StageError };

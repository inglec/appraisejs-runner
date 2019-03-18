const { reduce } = require('lodash/collection');

const schema = require('../../benchmark_definition_schema');

const validateBenchmarkDefinition = (benchmarkDefinition) => {
  const schemaKeys = Object.keys(schema);
  const invalidKeys = Object.keys(benchmarkDefinition).filter(key => !schemaKeys.includes(key));
  const warnings = invalidKeys.map(key => `"${key}" is not a valid benchmark definition key`);

  return reduce(
    schema,
    (acc, schemaValue, key) => {
      const {
        defaultValue,
        isRequired,
        maxValue,
        minValue,
        type,
      } = schemaValue;
      const value = benchmarkDefinition[key];

      if (value) {
        // eslint-disable-next-line valid-typeof
        if (typeof value !== type) {
          throw Error(`field "${key}" should be of type ${type}, but was ${typeof value}`);
        } else if (type === 'number' && minValue && value < minValue) {
          acc.definition[key] = minValue;
          acc.warnings.push(`field "${key}" has a minimum value of ${minValue}, but was ${value}`);
        } else if (type === 'number' && maxValue && value > maxValue) {
          acc.definition[key] = maxValue;
          acc.warnings.push(`field "${key}" has a maximum value of ${maxValue}, but was ${value}`);
        } else {
          acc.definition[key] = value;
        }
      } else if (isRequired) {
        throw Error(`field "${key}" is required, but was ${value}`);
      } else if (defaultValue) {
        acc.definition[key] = defaultValue;
      }

      return acc;
    },
    { definition: {}, warnings },
  );
};

module.exports = { validateBenchmarkDefinition };

const { chain, pick } = require('lodash');

const { validateBenchmarkDefinition } = require('../../src/utils/benchmarks');
const benchmarkDefinitionSchema = require('../../benchmark_definition_schema');

const defaultBenchmarkDefinition = chain(benchmarkDefinitionSchema)
  .mapValues(value => value.defaultValue)
  .pickBy(value => !!value)
  .value();

describe('validateBenchmarkDefinition', () => {
  const validDefinition = {
    ...defaultBenchmarkDefinition,
    benchmark: () => {},
  };

  test('validates full definition', () => {
    const { definition } = validateBenchmarkDefinition(validDefinition);
    expect(definition).toEqual(validDefinition);
  });

  test('validates basic definition', () => {
    const benchmarkDefinition = pick(validDefinition, 'benchmark');

    const { definition } = validateBenchmarkDefinition(benchmarkDefinition);
    expect(definition).toEqual({
      ...benchmarkDefinition,
      runs: 1,
      timeout: 5000,
      maxAttempts: 1,
    });
  });

  test('throws error for missing required benchmark key', () => {
    const benchmarkDefinition = {};

    expect(() => validateBenchmarkDefinition(benchmarkDefinition))
      .toThrow('field "benchmark" is required, but was undefined');
  });

  test('throws error for incorrect type', () => {
    const benchmarkDefinition = {
      ...validDefinition,
      timeout: '2000',
    };

    expect(() => validateBenchmarkDefinition(benchmarkDefinition))
      .toThrow('field "timeout" should be of type number, but was string');
  });

  test('returns warning for unexpected key', () => {
    const benchmarkDefinition = {
      ...validDefinition,
      unexpected: 'a',
    };

    const { warnings } = validateBenchmarkDefinition(benchmarkDefinition);
    expect(warnings).toEqual(['"unexpected" is not a valid benchmark definition key']);
  });

  test('returns warning for value above or below minimum', () => {
    const benchmarkDefinition = {
      ...validDefinition,
      runs: -1,
      timeout: 60000,
    };

    const { warnings } = validateBenchmarkDefinition(benchmarkDefinition);
    expect(warnings)
      .toEqual(
        expect.arrayContaining([
          'field "runs" has a minimum value of 1, but was -1',
          'field "timeout" has a maximum value of 30000, but was 60000',
        ]),
      );
  });
});

const { join } = require('path');

const benchmarkProject = require('../src/benchmark');

const ASYNC_TIMEOUT = 60000;

const projectPath = join(__dirname, 'test_project');

beforeAll(() => {
  // FIXME
  process.env.NODE_PATH = join(__dirname, '..');
});

describe('benchmarkProject', () => {
  test('runs "test_project"', () => (
    expect(benchmarkProject(projectPath))
      .resolves
      .toEqual(expect.arrayContaining([]))
  ), ASYNC_TIMEOUT);
});

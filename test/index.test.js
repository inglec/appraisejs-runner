const path = require('path');

const benchmarkProject = require('../src/benchmark');

const ASYNC_TIMEOUT = 60000;

const projectPath = path.join(__dirname, 'test_project');

describe('benchmarkProject', () => {
  test('runs "test_project"', () => (
    expect(benchmarkProject(projectPath))
      .resolves
      .toEqual(expect.arrayContaining([]))
  ), ASYNC_TIMEOUT);
});

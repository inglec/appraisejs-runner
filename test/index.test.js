const path = require('path');

const benchmarkProject = require('../src/index');

describe('benchmarkProject', () => {
  test('runs \'test_project\'', () => {
    const projectPath = path.join(__dirname, 'test_project');

    return benchmarkProject(projectPath);
  });
});

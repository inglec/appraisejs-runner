const path = require('path');

const {
  benchmarkProject,
  // createSandbox,
  // discoverBenchmarkFiles,
  // getSandboxedBenchmarks,
  // runBenchmark,
  // runBenchmarks,
} = require('../src/index');

describe('benchmarkProject', () => {
  test('runs \'test_project\'', () => {
    const projectPath = path.join(__dirname, 'test_project');
    return benchmarkProject(projectPath);
  });
});

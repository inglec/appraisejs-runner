const path = require('path');

const benchmarkProject = require('../src/index');

test('Runs mock project', async () => {
  const dir = path.join(__dirname, 'mock');
  await benchmarkProject(dir);
});

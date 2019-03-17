/* eslint-disable promise/always-return */

const { config: loadEnv } = require('dotenv');

const benchmarkProject = require('../src/benchmark');

loadEnv();
const { NODE_PATH, TEST_PROJECT_PATH } = process.env;

// Time out after 2 minutes
const TIMEOUT = 1000 * 60 * 2;

describe('benchmarkProject', () => {
  test('benchmarks project', () => benchmarkProject(TEST_PROJECT_PATH, NODE_PATH), TIMEOUT);
});

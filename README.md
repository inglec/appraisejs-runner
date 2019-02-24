# AppraiseJs: Runner

The architecture of the runner is as follows:
* A runner.
* The runner spawns multiple child Node processes.
* Each child creates a VM2 sandbox.

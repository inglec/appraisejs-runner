const sendMessage = (stage, status, body) => process.send({ body, stage, status });

module.exports = { sendMessage };

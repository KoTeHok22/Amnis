const { createServer } = require("./src/app");
const { HOST, PORT } = require("./src/config");

createServer().listen(PORT, HOST, () => {
  console.log(`Qwen OpenAI-compatible adapter listening on http://${HOST}:${PORT}`);
});

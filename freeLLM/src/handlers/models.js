const { listModels } = require("../catalog");
const { json } = require("../http");

function handleModels(_req, res) {
  json(res, 200, {
    object: "list",
    data: listModels(),
  });
}

module.exports = {
  handleModels,
};

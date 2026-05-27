const { DEFAULT_MODEL: QWEN_DEFAULT_MODEL } = require("./qwen");

const BASE_MODELS = [
  {
    id: "qwen3.6-plus",
    name: "Qwen 3.6 Plus",
    provider: "alibaba",
    upstreamId: "qwen3.6-plus",
    aliases: ["qwen", "qwen-3.6-plus", "qwen3-6-plus"],
  },
];

const DEFAULT_MODEL_ID = QWEN_DEFAULT_MODEL;

const MODELS = BASE_MODELS.map((model) => ({
  mode: "chat",
  object: "model",
  created: 0,
  ...model,
}));

const MODEL_MAP = new Map();

for (const model of MODELS) {
  for (const alias of [model.id, ...(model.aliases || []), model.upstreamId].filter(Boolean)) {
    MODEL_MAP.set(String(alias).toLowerCase(), model);
  }
}

function resolveModel(modelId) {
  const key = String(modelId || DEFAULT_MODEL_ID).toLowerCase();
  return MODEL_MAP.get(key) || null;
}

function listModels() {
  return MODELS.map((model) => ({
    id: model.id,
    object: model.object,
    created: model.created,
    owned_by: model.provider,
    display_name: model.name,
    mode: model.mode,
    upstream_id: model.upstreamId || null,
    aliases: model.aliases || [],
  }));
}

module.exports = {
  DEFAULT_MODEL_ID,
  listModels,
  resolveModel,
};

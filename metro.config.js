const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const workflowLogs = path
  .resolve(__dirname, ".local/state/workflow-logs")
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  .replace(/[/\\]+/g, "[/\\\\]");
const transientWorkflowLogs = new RegExp(`^${workflowLogs}(?:[/\\\\].*)?$`);
const existingBlockList = config.resolver.blockList;

config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  transientWorkflowLogs,
];

module.exports = config;
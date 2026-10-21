/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// În sesiunile Claude Code din cloud Chromium e preinstalat; local, Remotion își descarcă singur browserul.
const CHROMIUM_CLOUD =
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
if (existsSync(CHROMIUM_CLOUD)) {
  Config.setBrowserExecutable(CHROMIUM_CLOUD);
}

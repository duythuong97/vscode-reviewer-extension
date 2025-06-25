import * as vscode from "vscode";
import { ConfigManager } from "../configManager";
import { SettingsPanelProvider } from "../settingsPanelProvider";
import { debugOutputChannel, logDebug, handleError } from "../utils";

export class SettingsCommands {
  constructor(
    private configManager: ConfigManager,
    private settingsPanelProvider: SettingsPanelProvider
  ) {}

  public async openSettings(): Promise<void> {
    try {
      await vscode.commands.executeCommand("aiReviewer.settingsPanel.focus");
      logDebug(debugOutputChannel, `[Settings] Opened settings panel`);
    } catch (error) {
      handleError(error, "Opening settings");
    }
  }

  public async resetSettings(): Promise<void> {
    try {
      await this.configManager.resetToDefaults();
      vscode.window.showInformationMessage("Settings reset to defaults successfully.");
      logDebug(debugOutputChannel, `[Settings] Reset settings to defaults`);
    } catch (error) {
      handleError(error, "Resetting settings");
    }
  }

  public async validateSettings(): Promise<void> {
    try {
      const validation = this.configManager.validateConfig();

      if (validation.isValid) {
        vscode.window.showInformationMessage("Settings are valid!");
      } else {
        vscode.window.showWarningMessage("Settings validation failed. Please check your configuration.");
      }

      logDebug(debugOutputChannel, `[Settings] Validated settings`, { isValid: validation.isValid });
    } catch (error) {
      handleError(error, "Validating settings");
    }
  }
}
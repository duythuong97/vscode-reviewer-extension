import * as vscode from "vscode";
import { Logger, VSCodeUtils, debugOutputChannel } from '../utils';
import { ConfigManager } from '../core/managers/ConfigManager';
import { SettingsPanelProvider } from '../ui/panels/SettingsPanelProvider';

export class SettingsCommands {
  constructor(
    private configManager: ConfigManager,
    private settingsPanelProvider: SettingsPanelProvider
  ) {}

  public async openSettings(): Promise<void> {
    try {
      await vscode.commands.executeCommand("aiReviewer.settingsPanel.focus");
      Logger.logDebug(debugOutputChannel, `[Settings] Opened settings panel`);
    } catch (error) {
      VSCodeUtils.handleError(error, "Opening settings");
    }
  }

  public async resetSettings(): Promise<void> {
    try {
      await this.configManager.resetToDefaults();
      vscode.window.showInformationMessage("Settings reset to defaults successfully.");
      Logger.logDebug(debugOutputChannel, `[Settings] Reset settings to defaults`);
    } catch (error) {
      VSCodeUtils.handleError(error, "Resetting settings");
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

      Logger.logDebug(debugOutputChannel, `[Settings] Validated settings`, { isValid: validation.isValid });
    } catch (error) {
      VSCodeUtils.handleError(error, "Validating settings");
    }
  }
}
import * as vscode from "vscode";
import { Logger, VSCodeUtils, debugOutputChannel } from "../utils";
import { ConfigManager } from "../core/managers/ConfigManager";
import { SettingsPanelProvider } from "../ui/panels/SettingsPanelProvider";

export class SettingsCommands {
  constructor(
    private configManager: ConfigManager,
    private settingsPanelProvider: SettingsPanelProvider
  ) {}

  public async openSettings(): Promise<void> {
    try {
      await vscode.commands.executeCommand("aiReviewer.settingsPanel.focus");
    } catch (error) {
      VSCodeUtils.handleError(error, "Opening settings");
    }
  }

  public async resetSettings(): Promise<void> {
    try {
      await this.configManager.resetToDefaults();
      vscode.window.showInformationMessage(
        "Settings reset to defaults successfully."
      );
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
        vscode.window.showWarningMessage(
          "Settings validation failed. Please check your configuration."
        );
      }
    } catch (error) {
      VSCodeUtils.handleError(error, "Validating settings");
    }
  }
}

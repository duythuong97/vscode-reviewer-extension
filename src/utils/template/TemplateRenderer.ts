import * as fs from 'fs';
import * as path from 'path';
import { Logger, debugOutputChannel } from '../logging/Logger';

export class TemplateRenderer {
  static renderTemplate(templatePath: string, data: any): string {
    try {
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      let templateContent = fs.readFileSync(templatePath, 'utf8');

      // Replace variables in template
      templateContent = TemplateRenderer.replaceVariables(templateContent, data);

      // Handle Handlebars-style conditionals and loops
      templateContent = TemplateRenderer.processHandlebars(templateContent, data);

      return templateContent;
    } catch (error) {
      Logger.logDebug(debugOutputChannel, `[TemplateRenderer] Error rendering template:`, error);
      throw new Error(`Failed to render template: ${error}`);
    }
  }

  private static replaceVariables(content: string, data: any): string {
    // Replace simple variables like {{variableName}}
    return content.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
      const keys = variableName.trim().split('.');
      let value = data;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match; // Keep original if not found
        }
      }

      return value !== undefined ? String(value) : match;
    });
  }

  private static processHandlebars(content: string, data: any): string {
    // Handle {{#if condition}} ... {{/if}}
    content = content.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, body) => {
      const keys = condition.trim().split('.');
      let value = data;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return ''; // Remove block if condition is false
        }
      }

      return value ? body : '';
    });

    // Handle {{#each array}} ... {{/each}}
    content = content.replace(/\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, body) => {
      const keys = arrayName.trim().split('.');
      let array = data;

      for (const key of keys) {
        if (array && typeof array === 'object' && key in array) {
          array = array[key];
        } else {
          return ''; // Remove block if array not found
        }
      }

      if (!Array.isArray(array)) {
        return '';
      }

      return array.map((item, index) => {
        let itemBody = body;
        // Replace {{@index}} with current index
        itemBody = itemBody.replace(/\{\{@index\}\}/g, String(index));
        // Replace variables in the context of current item
        itemBody = TemplateRenderer.replaceVariables(itemBody, item);
        return itemBody;
      }).join('');
    });

    return content;
  }

  static renderChatMessageTemplate(data: {
    messageType: 'user' | 'ai';
    messageContent: string;
    timestamp: string;
    isUser: boolean;
  }): string {
    return `
      <div class="message ${data.isUser ? 'user' : 'ai'}">
        <div class="message-bubble">
          ${data.messageContent}
        </div>
        <div class="message-time">${data.timestamp}</div>
      </div>
    `;
  }

  static renderCodeChipTemplate(data: {
    displayStyle: 'block' | 'none';
    chipText: string;
  }): string {
    return `
      <div id="codeChip" class="code-chip" style="display: ${data.displayStyle};">
        ${data.chipText}
      </div>
    `;
  }

  static renderCodeBlockButtonsTemplate(data: {
    fileName: string;
    lineNumber: number;
    escapedCode: string;
    escapedOriginalCode: string;
  }): string {
    return `
      <div class="code-block-buttons">
        <button class="apply-code-btn" onclick="applyCodeChange('${data.fileName}', ${data.lineNumber}, '${data.escapedCode}', '${data.escapedOriginalCode}')">
          ✨ Apply Fix
        </button>
        <button class="approve-btn" onclick="approveViolation('${data.fileName}', ${data.lineNumber})">
          ✅ Approve
        </button>
        <button class="reject-btn" onclick="rejectViolation('${data.fileName}', ${data.lineNumber})">
          ❌ Reject
        </button>
      </div>
    `;
  }
}
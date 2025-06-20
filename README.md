# AI Reviewer

A Visual Studio Code extension that provides AI-powered code review using local LLM models through Ollama. This extension analyzes your code against custom coding conventions and provides detailed feedback on code quality, potential improvements, security concerns, and performance considerations.

## Features

- 🤖 **AI-Powered Code Review**: Uses local LLM models (like CodeLlama) for intelligent code analysis
- 📝 **Custom Coding Conventions**: Define your own coding standards and rules
- 🔧 **Configurable LLM Settings**: Support for different LLM endpoints and models
- 🎯 **Comprehensive Analysis**: Reviews code quality, security, performance, and adherence to conventions
- 💻 **Seamless Integration**: Works directly within VS Code with a dedicated settings panel
- 📊 **Structured Feedback**: Provides clear, organized review results in markdown format

## Requirements

- **Ollama**: Must be installed and running locally
- **LLM Model**: A code-aware model like `codellama` (recommended)
- **VS Code**: Version 1.101.0 or higher

### Installing Ollama

1. Visit [Ollama.ai](https://ollama.ai) and download for your platform
2. Install and start Ollama
3. Pull a code-aware model:
   ```bash
   ollama pull codellama
   ```

## Installation

1. Download the `.vsix` file from the releases
2. In VS Code, go to Extensions (Ctrl+Shift+X)
3. Click the "..." menu and select "Install from VSIX..."
4. Choose the downloaded file
5. Reload VS Code when prompted

## Extension Settings

This extension contributes the following settings:

* `aiReviewer.apiToken`: API token for authentication (if required by your LLM service)
* `aiReviewer.codingConvention`: Your custom coding convention rules (supports markdown formatting)
* `aiReviewer.llmEndpoint`: LLM API endpoint URL (default: `http://localhost:11434/api/generate`)
* `aiReviewer.llmModel`: LLM model name to use for code review (default: `llama3`)

## Usage

### Quick Start

1. **Configure Settings**: Open the AI Reviewer settings panel from the sidebar
2. **Set API Token**: Enter your API token (if required)
3. **Define Conventions**: Write your coding conventions in the text area
4. **Configure LLM**: Set your preferred LLM endpoint and model
5. **Review Code**: Open any code file and run "AI Reviewer: Review Current File"

### Commands

- `AI Reviewer: Review Current File` - Analyzes the currently open file
- `AI Reviewer: Show Settings` - Displays current configuration
- `Open Settings Panel` - Opens the settings panel in the sidebar

### Settings Panel

The extension provides a dedicated settings panel in the VS Code sidebar where you can:

- Configure your API token
- Write coding conventions with markdown support
- Set LLM endpoint and model preferences
- Save and manage all settings

### Coding Conventions

You can define your coding conventions using markdown formatting. For example:

```markdown
# Coding Standards

## Naming Conventions
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_CASE for constants

## Code Structure
- Maximum function length: 50 lines
- Maximum file length: 500 lines
- Use meaningful variable names

## Security Guidelines
- Always validate user input
- Use parameterized queries for database operations
- Avoid hardcoding sensitive information
```

## Configuration Examples

### Using CodeLlama Model

```json
{
  "aiReviewer.llmEndpoint": "http://localhost:11434/api/generate",
  "aiReviewer.llmModel": "codellama",
  "aiReviewer.apiToken": "",
  "aiReviewer.codingConvention": "# Your coding conventions here"
}
```

### Using Custom Ollama Endpoint

```json
{
  "aiReviewer.llmEndpoint": "http://your-ollama-server:11434/api/generate",
  "aiReviewer.llmModel": "your-custom-model"
}
```

## Review Output

The extension generates comprehensive reviews that include:

1. **Code Quality Assessment** - Overall code structure and readability
2. **Potential Improvements** - Suggestions for better practices
3. **Security Concerns** - Security vulnerabilities and recommendations
4. **Performance Considerations** - Optimization opportunities
5. **Convention Adherence** - How well the code follows your defined standards

Reviews are displayed in a new markdown document with clear sections and actionable feedback.

## Troubleshooting

### Common Issues

1. **"API token not configured"**: Set your API token in the settings panel
2. **"Failed to call LLM API"**: Ensure Ollama is running and the endpoint is correct
3. **"No response received"**: Check if your LLM model is properly loaded

### Debug Information

Enable developer tools to see detailed logs:
1. Open Command Palette (Ctrl+Shift+P)
2. Run "Developer: Toggle Developer Tools"
3. Check the console for error messages

## Release Notes

### 0.0.1

- Initial release
- Basic code review functionality
- Configurable LLM settings
- Custom coding conventions support
- Settings panel integration
- Markdown-formatted review output

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This extension is licensed under the MIT License.

---

**Enjoy using AI Reviewer for better code quality!** 🚀

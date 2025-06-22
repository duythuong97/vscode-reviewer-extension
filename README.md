# AI Reviewer

A Visual Studio Code extension that provides AI-powered code review using local LLM models through Ollama. This extension analyzes your code against custom coding conventions and provides detailed feedback on code quality, potential improvements, security concerns, and performance considerations.

## Features

- 🤖 **AI-Powered Code Review**: Uses local LLM models (like CodeLlama) for intelligent code analysis
- 💬 **Interactive Chat**: Chat with AI about your code with real-time code selection support
- 📝 **Custom Coding Conventions**: Define your own coding standards and rules
- 🔧 **Configurable LLM Settings**: Support for different LLM endpoints and models
- 🎯 **Comprehensive Analysis**: Reviews code quality, security, performance, and adherence to conventions
- 💻 **Seamless Integration**: Works directly within VS Code with dedicated settings and chat panels
- 📊 **Structured Feedback**: Provides clear, organized review results in markdown format
- 👻 **AI Ghost Text**: Real-time AI-powered code suggestions as you type

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
* `aiReviewer.ghostTextEnabled`: Enable AI-powered ghost text suggestions while typing (default: `true`)

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
- `AI Reviewer: Toggle Ghost Text` - Enable/disable AI ghost text suggestions
- `Accept AI Ghost Suggestion` - Accept the current ghost text suggestion
- `AI Reviewer: AI Prompt Popup` - Open popup to ask AI and insert response in editor (Cmd+Shift+I)

### Settings Panel

The extension provides a dedicated settings panel in the VS Code sidebar where you can:

- Configure your API token
- Write coding conventions with markdown support
- Set LLM endpoint and model preferences
- Save and manage all settings

### Chat Panel

The extension includes an interactive chat panel that allows you to:

- **Real-time Code Selection**: Select code in your editor and see a chip showing the file name and line range
- **Contextual Questions**: Ask questions about your selected code or general programming questions
- **AI Responses**: Get instant responses from your configured LLM model
- **Code Context**: The AI automatically includes your selected code in the conversation context

#### How to Use the Chat:

1. **Open the Chat Panel**: Click on the "Chat" tab in the AI Reviewer sidebar
2. **Select Code**: Highlight any code in your editor - a chip will appear showing the file and line range
3. **Ask Questions**: Type your question in the message input area
4. **Send Message**: Click "Send Message" or press Enter to get an AI response
5. **View Response**: The AI response will appear in the response area above the input

#### Chat Features:

- **Code Selection Detection**: Automatically detects when you select code in the editor
- **File Context**: Shows filename and line range for selected code
- **Rich Responses**: AI responses are formatted and easy to read
- **Error Handling**: Clear error messages if something goes wrong
- **Loading States**: Visual feedback while waiting for AI responses

### AI Ghost Text

The extension provides intelligent code suggestions as you type, powered by your configured LLM model. These suggestions appear as ghost text (grayed-out text) in your editor, helping you write better code faster.

#### How Ghost Text Works:

1. **Real-time Suggestions**: As you type, the AI analyzes your code context and provides suggestions
2. **Context-Aware**: Takes into account your coding conventions and the surrounding code
3. **Debounced**: Suggestions are generated after a brief pause to avoid excessive API calls
4. **Acceptable**: Press Tab to accept a suggestion, or continue typing to ignore it

#### Ghost Text Features:

- **Smart Context**: Analyzes the previous 5 lines of code for context
- **Language-Specific**: Provides suggestions tailored to the programming language you're using
- **Convention-Aware**: Respects your defined coding conventions
- **Toggle Control**: Enable/disable ghost text from settings or command palette
- **Performance Optimized**: Uses debouncing to prevent excessive API calls

#### Using Ghost Text:

1. **Enable the Feature**: Go to AI Reviewer settings and check "Enable AI Ghost Text Suggestions"
2. **Start Typing**: Begin writing code in any supported language
3. **See Suggestions**: Gray ghost text will appear showing AI suggestions
4. **Accept Suggestions**: Press Tab to accept a suggestion, or continue typing to ignore
5. **Toggle On/Off**: Use the command "AI Reviewer: Toggle Ghost Text" to quickly enable/disable

#### Ghost Text Commands:

- `AI Reviewer: Toggle Ghost Text` - Quickly enable/disable ghost text suggestions
- `Accept AI Ghost Suggestion` - Accept the current ghost text suggestion (usually bound to Tab)

### AI Prompt Popup

The extension provides a quick way to ask the AI questions and get responses directly in your editor using a keyboard shortcut.

#### How to Use:

1. **Keyboard Shortcut**: Press `Cmd+Shift+I` (or `Ctrl+Shift+I` on Windows/Linux)
2. **Enter Your Prompt**: Type your question or request in the popup
3. **Get AI Response**: The AI response will be inserted at your cursor position
4. **Context Awareness**: If you have text selected, it will be included as context

#### Features:

- **Quick Access**: Simple keyboard shortcut for instant AI interaction
- **Context Support**: Automatically includes selected code as context
- **Smart Insertion**: Inserts at cursor or replaces selected text
- **Progress Indicator**: Shows "AI is thinking..." while processing
- **Error Handling**: Clear error messages if something goes wrong

#### Use Cases:

- **Code Generation**: "Write a function to sort an array"
- **Code Review**: "Review this code for potential issues"
- **Bug Fixing**: "Help me fix this error"
- **Documentation**: "Add comments to this function"
- **Refactoring**: "Refactor this code to be more efficient"

#### Example Workflow:

1. Select some code you want to ask about
2. Press `Cmd+Shift+I`
3. Type: "Explain what this code does"
4. Press Enter
5. AI response is inserted in your editor

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

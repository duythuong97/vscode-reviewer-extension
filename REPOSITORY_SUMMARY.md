# AI Reviewer VS Code Extension - Repository Summary

## Overview

**AI Reviewer** is a comprehensive Visual Studio Code extension that provides AI-powered code review capabilities using local Large Language Models (LLMs) through Ollama. The extension integrates intelligent code analysis, real-time suggestions, and interactive chat functionality directly into the VS Code development environment.

## Key Features

### 🤖 AI-Powered Code Review
- Analyzes code against custom coding conventions
- Provides structured feedback on code quality, security, and performance
- Supports multiple LLM providers (Ollama, OpenAI)
- Configurable review criteria and severity thresholds

### 💬 Interactive Chat System
- Real-time code selection support with context awareness
- Contextual questions about selected code
- Chat history management and session control
- File context integration showing filename and line ranges

### 👻 AI Ghost Text Suggestions
- Real-time code suggestions while typing
- Context-aware completions based on surrounding code
- Respects defined coding conventions
- Debounced API calls for performance optimization

### 🎯 Multiple Interface Modes
- **Panel Mode**: Dedicated webview panels for comprehensive reviews
- **Inline Mode**: Inline diagnostics directly in the editor
- **Popup Mode**: Quick AI prompts with keyboard shortcuts (Cmd+Shift+I)
- **Chat Mode**: Interactive conversation interface

## Architecture

### Core Components

#### 1. **Core Module** (`src/core/`)
- **extension.ts**: Main extension entry point and activation logic
- **Prompts.ts**: AI prompt templates and formatting
- **workspaceFileTemplate.ts**: Template system for workspace files
- **managers/**: Configuration and state management

#### 2. **Services Layer** (`src/services/`)
- **llm/**: LLM provider abstraction and API integration
- **git/**: Git operations and repository management
- **workspace/**: Workspace file operations and analysis
- **storage/**: Data persistence and cache management

#### 3. **UI Components** (`src/ui/`)
- **panels/**: WebView panels for different functionalities
  - ChatPanelProvider
  - ReviewPanelProvider
  - AgentPanelProvider
  - SettingsPanelProvider
- **ghostText/**: Real-time code suggestion system

#### 4. **Commands** (`src/commands/`)
- **reviewCommands.ts**: Code review functionality
- **chatCommands.ts**: Chat interaction commands
- **ghostTextCommands.ts**: Ghost text management
- **WorkspaceCommands.ts**: Workspace operations
- **templateCommands.ts**: Template management
- **utilityCommands.ts**: Utility functions

#### 5. **Agent System** (`src/agents/`)
- **tasks/**: Task-based agent architecture
  - AgentTaskBase: Base class for agent tasks
  - UnitTestGeneratorTask: Automated unit test generation
- **types/**: Agent-specific type definitions

#### 6. **Type Definitions** (`src/types/`)
- **llm.ts**: LLM provider interfaces
- **workspace.ts**: Workspace-related types
- **storage.ts**: Storage and persistence types
- **violation.ts**: Code violation and review types

## Configuration System

### Key Settings
- **Authentication**: Token-based or cookie-based auth
- **LLM Configuration**: Endpoint URL, model selection, parameters
- **Review Settings**: Severity thresholds, auto-review options
- **UI Preferences**: Theme awareness, notification settings
- **Ghost Text**: Enable/disable real-time suggestions
- **Custom Conventions**: Markdown-formatted coding standards

### Provider Support
- **Ollama**: Local LLM deployment (default)
- **OpenAI**: Cloud-based API integration
- **Custom Endpoints**: Flexible API configuration

## User Interface

### Web-based Panels
- **Settings Panel**: Configuration management with markdown support
- **Chat Panel**: Interactive AI conversation interface
- **Review Panel**: Comprehensive code review results
- **Agent Panel**: Task-based agent interactions

### Media Assets (`media/`)
- **HTML Templates**: Rich UI components for panels
- **CSS Styles**: Theme-aware styling
- **JavaScript**: Interactive frontend logic
- **Templates**: Reusable UI components

## Development Environment

### Technology Stack
- **TypeScript**: Primary development language
- **Node.js**: Runtime environment
- **VS Code API**: Extension framework
- **Handlebars**: Template engine for dynamic content
- **XState**: State management for complex workflows

### Dependencies
- **Core**: VS Code API, TypeScript, Node.js
- **UI**: Handlebars, Marked (markdown processing)
- **State Management**: XState, Vue integration
- **Utilities**: JSON5, strip-json-comments

### Build System
- **Compilation**: TypeScript compiler with watch mode
- **Asset Pipeline**: Media file copying and optimization
- **Testing**: VS Code test framework integration
- **Linting**: ESLint with TypeScript configuration

## Installation & Setup

### Prerequisites
- VS Code 1.101.0 or higher
- Ollama installed and running locally
- LLM model (e.g., CodeLlama, Llama3)

### Configuration
1. Install from VSIX package
2. Configure LLM endpoint and model
3. Set up coding conventions
4. Configure authentication if required

## Usage Patterns

### Review Workflow
1. **File Review**: Analyze individual files against conventions
2. **PR Review**: Comprehensive pull request analysis
3. **Batch Processing**: Multiple file review capabilities
4. **Interactive Feedback**: Real-time suggestions and corrections

### Chat Interaction
1. **Code Selection**: Highlight code for context
2. **Question Submission**: Ask specific questions about code
3. **AI Response**: Receive structured feedback
4. **Session Management**: Maintain conversation history

### Ghost Text Integration
1. **Real-time Suggestions**: AI-powered autocompletion
2. **Context Analysis**: Previous code lines for context
3. **Convention Adherence**: Suggestions follow defined standards
4. **Performance Optimization**: Debounced API calls

## Key Innovations

### 1. **Local LLM Integration**
- Privacy-focused approach using local models
- Reduced dependency on cloud services
- Customizable model selection and parameters

### 2. **Convention-Aware Analysis**
- Custom coding standard definitions
- Markdown-formatted convention documentation
- Flexible rule configuration

### 3. **Multi-Modal Interface**
- Panel-based comprehensive reviews
- Inline editor diagnostics
- Interactive chat system
- Real-time ghost text suggestions

### 4. **Agent-Based Architecture**
- Task-oriented agent system
- Extensible agent framework
- Specialized tasks (unit test generation)

## Future Extensibility

The codebase is designed for extensibility with:
- **Plugin Architecture**: Easy addition of new LLM providers
- **Agent System**: Expandable task-based functionality
- **Template System**: Customizable UI components
- **Configuration Framework**: Flexible setting management

## Summary

AI Reviewer represents a sophisticated VS Code extension that bridges AI capabilities with practical code review needs. It offers a privacy-conscious approach through local LLM integration while providing multiple interaction modes to suit different development workflows. The architecture is well-structured with clear separation of concerns, making it maintainable and extensible for future enhancements.

The extension successfully combines real-time AI assistance, comprehensive code analysis, and interactive chat functionality into a cohesive development tool that enhances code quality and developer productivity.
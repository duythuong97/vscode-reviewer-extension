# Right Panel Sidebar Implementation

## Overview

This VS Code extension now includes a **right panel sidebar** that provides additional functionality for the AI Reviewer extension. The right panel contains three main views:

1. **Review History** - Track and manage past code reviews
2. **Analytics** - View statistics and metrics about your reviews
3. **Templates** - Manage and use different review templates

## How to Access the Right Panel Sidebar

1. Open VS Code
2. Look for the **"AI Reviewer Tools"** icon in the **right panel** (next to the terminal, problems, output, etc.)
3. Click on it to open the right panel sidebar
4. You'll see three tabs: History, Analytics, and Templates

**Alternative ways to access:**
- Use the View menu: **View → AI Reviewer Tools**
- Use Command Palette: **Cmd/Ctrl + Shift + P** → "View: Show AI Reviewer Tools"
- The panel will appear on the right side of VS Code, similar to the Terminal or Problems panel

## Features

### Review History
- View all your past code reviews
- See the status of each review (success, warning, error)
- Click "View" to see the original review
- Click "Reapply" to apply the same review suggestions again

### Analytics Dashboard
- **Total Reviews**: Number of files reviewed
- **Issues Found**: Total issues detected across all reviews
- **Success Rate**: Percentage of reviews without issues
- **Weekly Activity**: Chart showing review activity by day of the week
- Click "Refresh Data" to update the statistics

### Review Templates
- **Default Review**: Standard code review with quality and security checks
- **Performance Review**: Focus on performance optimization and efficiency
- **Security Review**: Comprehensive security vulnerability assessment
- **Custom Templates**: Add, edit, and duplicate templates
- Click "Use" to apply a template to your current review

## Implementation Details

### File Structure
```
src/
├── historyPanelProvider.ts      # Review History view
├── analyticsPanelProvider.ts    # Analytics Dashboard view
├── templatesPanelProvider.ts    # Templates management view
├── secondarySidebarManager.ts   # Data management and business logic
└── extension.ts                 # Main extension file (updated)
```

### Key Components

1. **WebviewViewProvider Classes**: Each view is implemented as a webview provider
2. **SecondarySidebarManager**: Singleton class that manages all data and business logic
3. **Message Handling**: Communication between webviews and extension using postMessage
4. **Data Persistence**: Currently in-memory (can be extended to use workspace storage)

### Configuration (package.json)
```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "ai-reviewer-sidebar",
        "title": "AI Reviewer",
        "icon": "$(comment-discussion)"
      }
    ],
    "panel": [
      {
        "id": "ai-reviewer-secondary-panel",
        "title": "AI Reviewer Tools",
        "icon": "$(tools)"
      }
    ]
  },
  "views": {
    "ai-reviewer-sidebar": [
      {
        "id": "ai-reviewer-settings",
        "name": "Settings",
        "type": "webview"
      },
      {
        "id": "ai-reviewer-chat",
        "name": "Chat",
        "type": "webview"
      }
    ],
    "ai-reviewer-secondary-panel": [
      {
        "id": "ai-reviewer-history",
        "name": "Review History",
        "type": "webview"
      },
      {
        "id": "ai-reviewer-analytics",
        "name": "Analytics",
        "type": "webview"
      },
      {
        "id": "ai-reviewer-templates",
        "name": "Templates",
        "type": "webview"
      }
    ]
  }
}
```

## Usage Examples

### Using a Template
1. Open the right panel sidebar
2. Go to the "Templates" tab
3. Click "Use" on any template
4. The template will be applied to your next review

### Viewing Review History
1. Open the right panel sidebar
2. Go to the "History" tab
3. Click on any review item to see details
4. Use "Reapply" to apply the same suggestions again

### Checking Analytics
1. Open the right panel sidebar
2. Go to the "Analytics" tab
3. View your review statistics
4. Click "Refresh Data" to update

## Customization

### Adding New Templates
You can add new templates by modifying the `SecondarySidebarManager` class:

```typescript
// In secondarySidebarManager.ts
private templates: ReviewTemplate[] = [
  // ... existing templates
  {
    id: 'custom-template',
    name: 'Custom Template',
    description: 'Your custom review template',
    tags: ['custom', 'specialized'],
    prompt: 'Your custom prompt here...'
  }
];
```

### Styling
Each webview uses VS Code's CSS variables for consistent theming:
- `var(--vscode-font-family)`
- `var(--vscode-foreground)`
- `var(--vscode-editor-background)`
- `var(--vscode-button-background)`
- etc.

### Data Persistence
Currently, data is stored in memory. To add persistence:

1. Use `context.globalState` or `context.workspaceState`
2. Implement save/load methods in `SecondarySidebarManager`
3. Add error handling for data corruption

## Troubleshooting

### Right Panel Sidebar Not Appearing
1. Make sure the extension is properly activated
2. Check the console for any errors
3. Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")

### Data Not Updating
1. Check if the message handling is working
2. Verify the webview communication
3. Look for errors in the developer console

### Styling Issues
1. Ensure VS Code CSS variables are being used
2. Check for theme compatibility
3. Test in both light and dark themes

## Future Enhancements

1. **Data Persistence**: Save data to workspace storage
2. **Export/Import**: Export review history and templates
3. **Advanced Analytics**: More detailed metrics and charts
4. **Template Editor**: Visual template creation interface
5. **Integration**: Connect with external review systems
6. **Notifications**: Real-time updates and alerts
const vscode = acquireVsCodeApi();
// --- Agent Workflow Functions ---
window.addEventListener("message", (event) => {
  const { type, workflow, renderedHtml } = event.data;
  switch (type) {
    case "renderAgentWorkflow":
      const container = document.getElementById("agentWorkflowContainer");
      container.innerHTML = renderedHtml;
      break;
  }
});

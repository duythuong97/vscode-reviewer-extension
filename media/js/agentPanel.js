const vscode = acquireVsCodeApi();
// --- Agent Workflow Functions ---
window.addEventListener("message", (event) => {
  const { type, workflow, renderedHtml } = event.data;
  switch (type) {
    case "agentStepResult":
      updateAgentStepResult(workflow);
      break;
    case "completeAgentWorkflow":
      completeAgentWorkflow();
      break;
    case "agentWorkflow":
    case "updateAgentWorkflow":
    case "clearAgentWorkflow":
      const container = document.getElementById("agentWorkflowContainer");
      container.innerHTML = renderedHtml;
      break;
  }
});

function updateAgentStepResult(result) {
  const stepElement = document.querySelector(
    `[data-step-id="${result.stepId}"]`
  );
  if (stepElement) {
    const resultDiv = stepElement.querySelector(".step-result");
    const errorDiv = stepElement.querySelector(".step-error");
    if (result.success) {
      if (resultDiv) {
        resultDiv.innerHTML = `<strong>Result:</strong> ${JSON.stringify(
          result.data,
          null,
          2
        )}`;
        resultDiv.style.display = "block";
      }
      if (errorDiv) {
        errorDiv.style.display = "none";
      }
    } else {
      if (errorDiv) {
        errorDiv.innerHTML = `<strong>Error:</strong> ${result.error}`;
        errorDiv.style.display = "block";
      }
      if (resultDiv) {
        resultDiv.style.display = "none";
      }
    }
  }
}

function completeAgentWorkflow() {
  const container = document.getElementById("agentWorkflowContainer");
  const completionDiv = document.createElement("div");
  completionDiv.className = "workflow-completion";
  completionDiv.innerHTML = `
          <div style="text-align: center; padding: 20px; background: #44aa44; color: white; border-radius: 8px; margin: 16px 0;">
            <h3>🎉 AI Agent Workflow Completed!</h3>
            <p>All steps have been executed successfully.</p>
          </div>
        `;
  container.appendChild(completionDiv);
}

function createNewWorkflow() {
  vscode.postMessage({ type: "createAgentWorkflow" });
}
function executeStep(stepId) {
  vscode.postMessage({ type: "executeStep", stepId: stepId });
}
function executeCurrentStep() {
  vscode.postMessage({ type: "executeCurrentStep" });
}
function nextStep() {
  vscode.postMessage({ type: "nextStep" });
}
function executeFullWorkflow() {
  vscode.postMessage({ type: "executeFullWorkflow" });
}
function clearWorkflow() {
  vscode.postMessage({ type: "clearWorkflow" });
}

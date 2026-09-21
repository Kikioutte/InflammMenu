import { type FlowControls } from "../mobile";

export function popFlowToRoot(flow: FlowControls) {
  for (let depth = flow.stack.length - 1; depth > 0; depth -= 1) flow.pop();
}

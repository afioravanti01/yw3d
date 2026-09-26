export interface PanelMessage {
  readonly severity: 'error' | 'warning';
  readonly text: string;
}

/**
 * Visible panel with the errors and warnings of the world file and of the URL (YAML-002.d,
 * YAML-003.c, APP-001). Hidden when there is nothing to report.
 */
export class DiagnosticsPanel {
  constructor(private readonly element: HTMLElement) {}

  show(messages: readonly PanelMessage[]): void {
    this.element.replaceChildren(
      ...messages.map((m) => {
        const line = document.createElement('div');
        line.className = m.severity;
        line.textContent = m.text;
        return line;
      }),
    );
    this.element.hidden = messages.length === 0;
  }
}
